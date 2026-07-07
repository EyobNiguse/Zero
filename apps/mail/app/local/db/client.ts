/**
 * Browser-side SQLite client (main-thread proxy).
 *
 * The database itself runs in a Web Worker (./worker.ts) because the OPFS
 * SAH-pool VFS depends on `FileSystemFileHandle.createSyncAccessHandle`, which
 * browsers expose only in a Worker — never on the window main thread (verified
 * on Chrome 149). This file spawns that worker and routes Drizzle's
 * `sqlite-proxy` query/batch callbacks to it over postMessage.
 *
 * No COOP/COEP required (SAH-pool VFS, not the SharedArrayBuffer OPFS VFS). The
 * database file lives in OPFS and persists across reloads.
 *
 * KNOWN LIMITATION: the sqlite-proxy driver does not implement Drizzle's
 * `db.transaction()` (it throws). The read/query functions in ./queries work
 * as-is; multi-statement writes must use the batch path (wired below).
 */
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';

export type LocalDB = SqliteRemoteDatabase<typeof schema>;

interface WorkerReply {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

let dbPromise: Promise<LocalDB> | null = null;

function boot(): LocalDB {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

  // The OPFS SAH-pool VFS holds an exclusive access handle on the DB file for
  // the worker's lifetime. On HMR the module re-runs and would spawn a second
  // worker while the first still holds the file — "Access Handles cannot be
  // created..." — so terminate the old worker (releasing the handle) first.
  if (import.meta.hot) {
    import.meta.hot.dispose(() => worker.terminate());
  }

  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  worker.onmessage = (e: MessageEvent<WorkerReply>) => {
    const { id, ok, result, error } = e.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) entry.resolve(result);
    else entry.reject(new Error(error ?? 'sqlite worker error'));
  };
  worker.onerror = (e) => {
    // A worker-level failure (e.g. wasm load) can't be tied to one request;
    // reject everything in flight so callers see it instead of hanging.
    const err = new Error(e.message || 'sqlite worker crashed');
    for (const [, entry] of pending) entry.reject(err);
    pending.clear();
  };

  function call<T>(payload: Record<string, unknown>): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ id, ...payload });
    });
  }

  return drizzle(
    // query callback
    (sql, params, method) => call({ kind: 'query', sql, params, method }),
    // batch callback — atomic multi-statement write path
    (queries) => call({ kind: 'batch', queries }),
    { schema },
  );
}

/** Lazy singleton. Safe to call from anywhere; spawns the worker on first use. */
export function getLocalDB(): Promise<LocalDB> {
  if (!dbPromise) dbPromise = Promise.resolve(boot());
  return dbPromise;
}
