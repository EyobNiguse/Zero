/**
 * The SQLite engine itself, shared by both worker entry points (./shared-worker.ts and
 * ./worker.ts). Boots the database, runs queries, answers the request protocol.
 *
 * The OPFS SAH-pool VFS needs `createSyncAccessHandle`, which browsers expose only inside a worker
 * — never on the window main thread. That is why none of this can live in ./client.ts.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { runMigrations, type RawSqlite } from './migrations';

const DB_FILENAME = '/zero.sqlite3';
const VFS_NAME = 'zero-opfs';

export interface QueryMsg {
  id: number;
  kind: 'query';
  sql: string;
  params: unknown[];
  method: string;
}
export interface BatchMsg {
  id: number;
  kind: 'batch';
  queries: { sql: string; params: unknown[]; method: string }[];
}
/** Asks whether this database is the persistent OPFS one or the in-memory fallback. */
export interface StatusMsg {
  id: number;
  kind: 'status';
}
export type RequestMsg = QueryMsg | BatchMsg | StatusMsg;

export interface Reply {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface RawDb {
  exec(opts: {
    sql: string;
    bind?: unknown[];
    returnValue?: 'resultRows';
    rowMode?: 'array';
  }): unknown[][];
  exec(sql: string): unknown;
}

/** False once the OPFS handle could not be acquired and we fell back to :memory:. */
let persistent = true;

async function openOpfsDb(sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>>): Promise<RawDb> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: VFS_NAME });
      return new poolUtil.OpfsSAHPoolDb(DB_FILENAME) as unknown as RawDb;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw lastErr;
}

async function boot(): Promise<RawDb> {
  const sqlite3 = await sqlite3InitModule();
  let db: RawDb;
  try {
    db = await openOpfsDb(sqlite3);
  } catch {

    persistent = false;
    console.warn(
      'local mirror: OPFS is held by another tab — running in memory. Nothing written here survives ' +
        'this tab, including queued sends and unpushed drafts.',
    );
    db = new (sqlite3 as any).oo1.DB(':memory:', 'c') as RawDb;
  }
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA secure_delete = ON;');
  runMigrations(db as unknown as RawSqlite);
  return db;
}

// Boot eagerly; queue requests until the DB is ready.
const ready: Promise<RawDb> = boot();
let raw: RawDb | null = null;

/** One query. Mirrors the drizzle sqlite-proxy row shaping (rowMode 'array'). */
function runQuery(db: RawDb, sql: string, params: unknown[], method: string): { rows: unknown } {
  const rows = db.exec({
    sql,
    bind: params as never,
    returnValue: 'resultRows',
    rowMode: 'array',
  }) as unknown[][];
  // 'get' expects a single flat row array; 'all'/'values' expect array-of-arrays.
  return { rows: method === 'get' ? (rows[0] ?? []) : (rows ?? []) };
}

/** Multiple statements inside one BEGIN/COMMIT — the atomic write path. */
function runBatch(db: RawDb, queries: BatchMsg['queries']): { rows: unknown }[] {
  db.exec('BEGIN');
  try {
    const out = queries.map((q) => runQuery(db, q.sql, q.params, q.method));
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Serve one request. Never throws — a failure comes back as `{ ok: false }`. */
export async function handle(msg: RequestMsg): Promise<Reply> {
  try {
    if (!raw) raw = await ready;
    if (msg.kind === 'status') return { id: msg.id, ok: true, result: { persistent } };
    const result =
      msg.kind === 'batch'
        ? runBatch(raw, msg.queries)
        : runQuery(raw, msg.sql, msg.params, msg.method);
    return { id: msg.id, ok: true, result };
  } catch (err) {
    return { id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
