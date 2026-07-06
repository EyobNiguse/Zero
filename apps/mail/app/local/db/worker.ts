/**
 * SQLite worker. The OPFS SAH-pool VFS needs `createSyncAccessHandle`, which the
 * browser exposes ONLY in a Worker (never on the window main thread — true even
 * on current Chrome). So the database boots and runs entirely in here; the main
 * thread talks to it through postMessage (see ./client.ts).
 *
 * Protocol: main thread posts { id, kind: 'query' | 'batch', ... }; we reply
 * { id, ok: true, result } or { id, ok: false, error }.
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { runMigrations, type RawSqlite } from './migrations';

const DB_FILENAME = '/zero.sqlite3';
const VFS_NAME = 'zero-opfs';

interface QueryMsg {
  id: number;
  kind: 'query';
  sql: string;
  params: unknown[];
  method: string;
}
interface BatchMsg {
  id: number;
  kind: 'batch';
  queries: { sql: string; params: unknown[]; method: string }[];
}
type RequestMsg = QueryMsg | BatchMsg;

interface RawDb {
  exec(opts: {
    sql: string;
    bind?: unknown[];
    returnValue?: 'resultRows';
    rowMode?: 'array';
  }): unknown[][];
  exec(sql: string): unknown;
}

let raw: RawDb | null = null;

async function boot(): Promise<RawDb> {
  const sqlite3 = await sqlite3InitModule();
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: VFS_NAME });
  const db = new poolUtil.OpfsSAHPoolDb(DB_FILENAME) as unknown as RawDb;
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db as unknown as RawSqlite);
  return db;
}

// Boot eagerly; queue requests until the DB is ready.
const ready: Promise<RawDb> = boot();

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

self.onmessage = async (e: MessageEvent<RequestMsg>) => {
  const msg = e.data;
  try {
    if (!raw) raw = await ready;
    const result = msg.kind === 'batch' ? runBatch(raw, msg.queries) : runQuery(raw, msg.sql, msg.params, msg.method);
    (self as unknown as Worker).postMessage({ id: msg.id, ok: true, result });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage({ id: msg.id, ok: false, error });
  }
};
