import { hydrateMessageStubs, type LocalDB } from '../db';
import type { NormalizedThread } from '../mail/types';

// SQLite-primary reads; sync from provider only when a folder/thread is stale (>TTL) or absent.
export const PAGE_SIZE = 25;

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}
export function hydrateStubs(db: LocalDB, threads: NormalizedThread[]): Promise<void> {
  return hydrateMessageStubs(
    db,
    threads.map((t) => t.latestMessage).filter((m): m is NonNullable<typeof m> => m != null),
  );
}
