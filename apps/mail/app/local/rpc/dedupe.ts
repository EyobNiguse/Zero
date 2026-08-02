// Many attempts, one execution — three scopes of it. The mirror itself is ../db.
//   emitMirrorChanged  25 threads finish syncing, each with "data changed" — one notification.
//   dedupe             clicking Inbox 5 times fast — one fetch, the other 4 get its promise.
//   withTabLock        two tabs both flush the outbox — one wins, or the mail sends twice.
import { broadcastMirrorChanged, onRemoteMirrorChanged } from '../db/client';

type Listener = () => void;

const listeners = new Set<Listener>();
let subscribedToOtherTabs = false;

export function onMirrorChanged(fn: Listener): () => void {
  listeners.add(fn);
  // Tabs share one database through the SharedWorker, so another tab's sync leaves this one's
  // caches stale with nothing to say so. Delivered straight to the listeners: the writing tab has
  // already batched them, and re-entering the burst window here would only delay it again.
  if (!subscribedToOtherTabs) {
    subscribedToOtherTabs = true;
    onRemoteMirrorChanged(() => {
      for (const l of listeners) l();
    });
  }
  return () => {
    listeners.delete(fn);
  };
}

const BURST_MS = 200;
let pending: ReturnType<typeof setTimeout> | null = null;

/**
 * Batched: a list render revalidates up to 25 threads at once, and each one landing would
 * otherwise invalidate every query in the list. One notification per burst instead.
 */
export function emitMirrorChanged(): void {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    for (const fn of listeners) fn();
    broadcastMirrorChanged();
  }, BURST_MS);
}

const inflight = new Map<string, Promise<void>>();

/** Collapse concurrent syncs of the same target — clicking through folders must not fan out N fetches. */
export function dedupe(key: string, fn: () => Promise<void>): Promise<void> {
  const existing = inflight.get(key);
  if (existing) return existing;

  const run = fn().finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

/**
 * The same idea one scope up: only one tab runs `fn`. `dedupe` is per-tab state, which was enough
 * while a second tab had its own in-memory database — now that tabs share one, two flushers would
 * both read a queued send and both hand it to the provider. Sent twice, and not recallable.
 *
 * `ifAvailable` so a losing tab skips its turn rather than queueing: these are periodic, and the
 * next tick is seconds away.
 */
export function withTabLock(name: string, fn: () => Promise<void>): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.locks) return fn();
  return navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
    if (lock) await fn();
  }) as Promise<void>;
}
