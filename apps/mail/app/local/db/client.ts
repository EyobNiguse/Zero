/**
 * Browser-side SQLite client (main-thread proxy).
 *
 * The database runs in a worker because the OPFS SAH-pool VFS depends on
 * `FileSystemFileHandle.createSyncAccessHandle`, which browsers expose only in a
 * Worker — never on the window main thread. This file connects to that worker and
 * routes Drizzle's `sqlite-proxy` query/batch callbacks to it.
 *
 * A SharedWorker is preferred: the VFS takes an exclusive handle on the database
 * file, so exactly one worker per origin can own it. Sharing one means every tab
 * reads the same mirror. Where SharedWorker is unavailable (Chrome on Android) we
 * fall back to a dedicated worker, and a second tab then lands on an in-memory
 * database — `isMirrorPersistent()` reports that so the UI can say so.
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
import type { Reply } from './engine';

export type LocalDB = SqliteRemoteDatabase<typeof schema>;

type Send = (payload: Record<string, unknown>) => void;

interface Transport {
  send: Send;
  /** Broadcast "the mirror changed" to the other tabs. A no-op without a SharedWorker. */
  notify: () => void;
  onReply: (fn: (r: Reply) => void) => void;
  onError: (fn: (message: string) => void) => void;
  onRemoteChange: (fn: () => void) => void;
}

function sharedTransport(): Transport | null {
  if (typeof SharedWorker === 'undefined') return null;
  try {
    const worker = new SharedWorker(new URL('./shared-worker.ts', import.meta.url), {
      type: 'module',
      name: 'zero-sqlite',
    });
    const port = worker.port;
    let onRemote: (() => void) | null = null;
    let replyHandler: ((r: Reply) => void) | null = null;

    port.onmessage = (e: MessageEvent<Reply | { kind: 'notify' }>) => {
      if ((e.data as { kind?: string }).kind === 'notify') onRemote?.();
      else replyHandler?.(e.data as Reply);
    };
    port.start();

    return {
      send: (payload) => port.postMessage(payload),
      notify: () => port.postMessage({ kind: 'notify' }),
      onReply: (fn) => (replyHandler = fn),
      // A SharedWorker has no `onerror` that maps to a request; failures come back as ok:false.
      onError: () => {},
      onRemoteChange: (fn) => (onRemote = fn),
    };
  } catch {
    return null;
  }
}

function dedicatedTransport(): Transport {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

  // The SAH-pool VFS holds an exclusive access handle for the worker's lifetime. On HMR the module
  // re-runs and would spawn a second worker while the first still holds the file — terminate the
  // old one first. (The SharedWorker path is immune: the new client just reconnects to it.)
  if (import.meta.hot) {
    import.meta.hot.dispose(() => worker.terminate());
  }

  let replyHandler: ((r: Reply) => void) | null = null;
  worker.onmessage = (e: MessageEvent<Reply>) => replyHandler?.(e.data);

  return {
    send: (payload) => worker.postMessage(payload),
    notify: () => {},
    onReply: (fn) => (replyHandler = fn),
    onError: (fn) => {
      worker.onerror = (e) => fn(e.message || 'sqlite worker crashed');
    },
    onRemoteChange: () => {},
  };
}

let transport: Transport | null = null;
let dbPromise: Promise<LocalDB> | null = null;
let persistent: Promise<boolean> | null = null;
const remoteChangeListeners = new Set<() => void>();

function boot(): LocalDB {
  const t = sharedTransport() ?? dedicatedTransport();
  transport = t;

  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  t.onReply(({ id, ok, result, error }) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) entry.resolve(result);
    else entry.reject(new Error(error ?? 'sqlite worker error'));
  });

  t.onError((message) => {
    // A worker-level failure (e.g. wasm load) can't be tied to one request;
    // reject everything in flight so callers see it instead of hanging.
    const err = new Error(message);
    for (const [, entry] of pending) entry.reject(err);
    pending.clear();
  });

  t.onRemoteChange(() => {
    for (const fn of remoteChangeListeners) fn();
  });

  function call<T>(payload: Record<string, unknown>): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      t.send({ id, ...payload });
    });
  }

  persistent = call<{ persistent: boolean }>({ kind: 'status' })
    .then((s) => s.persistent)
    .catch(() => true);

  return drizzle(
    // query callback
    (sql, params, method) => call({ kind: 'query', sql, params, method }),
    // batch callback — atomic multi-statement write path
    (queries) => call({ kind: 'batch', queries }),
    { schema },
  );
}

/** Lazy singleton. Safe to call from anywhere; connects the worker on first use. */
export function getLocalDB(): Promise<LocalDB> {
  if (!dbPromise) dbPromise = Promise.resolve(boot());
  return dbPromise;
}

/**
 * False when this tab lost the race for the OPFS handle and is running in memory: reads still work
 * (the provider repopulates them) but nothing written here survives the tab, and the outbox is not
 * provider-backed until it has been pushed.
 */
export async function isMirrorPersistent(): Promise<boolean> {
  await getLocalDB();
  return persistent ?? Promise.resolve(true);
}

/** Tell the other tabs sharing this database that it changed. */
export function broadcastMirrorChanged(): void {
  transport?.notify();
}

/** Fires when another tab writes to the shared database. */
export function onRemoteMirrorChanged(fn: () => void): () => void {
  remoteChangeListeners.add(fn);
  return () => {
    remoteChangeListeners.delete(fn);
  };
}
