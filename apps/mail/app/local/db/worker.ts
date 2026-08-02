/**
 * Dedicated-worker entry — the fallback where SharedWorker is unavailable (Chrome on Android).
 *
 * One of these per tab, so a second tab loses the race for the OPFS handle and ends up on the
 * in-memory database. ./engine.ts says so out loud when that happens; ./client.ts surfaces it.
 */
import { handle, type RequestMsg } from './engine';

self.onmessage = async (e: MessageEvent<RequestMsg>) => {
  (self as unknown as Worker).postMessage(await handle(e.data));
};
