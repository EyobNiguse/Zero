// Background-revalidation plumbing for the SQLite mirror.
//
// Reads serve SQLite first and refresh behind the response, so the resolver has no way to return
// the newer data to the caller — it has to tell the UI to read again. LocalMode subscribes and
// invalidates the thread list.

type Listener = () => void;

const listeners = new Set<Listener>();

export function onMirrorChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const COALESCE_MS = 200;
let pending: ReturnType<typeof setTimeout> | null = null;

/**
 * Coalesced: a list render revalidates up to 25 threads at once, and each one landing would
 * otherwise invalidate every query in the list. One notification per burst instead.
 */
export function emitMirrorChanged(): void {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    for (const fn of listeners) fn();
  }, COALESCE_MS);
}

const inflight = new Map<string, Promise<void>>();

/** Collapse concurrent syncs of the same scope — clicking through folders must not fan out N fetches. */
export function dedupe(key: string, fn: () => Promise<void>): Promise<void> {
  const existing = inflight.get(key);
  if (existing) return existing;

  const run = fn().finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}
