// Freshness gate for provider syncs, backed by the `sync_state` table. Persisted, not in-memory,
// so a reload resumes instead of re-pulling every folder. Standalone to avoid an import cycle.
import {
  getSyncState,
  setSyncState,
  clearSyncState,
  clearSyncStateByPrefix,
  listSyncStateByPrefix,
  type LocalDB,
} from '../db';

export const SYNC_TTL_MS = 2 * 60 * 1000;

const folderScope = (folderId: string) => `folder:${folderId}`;
const threadScope = (threadId: string) => `thread:${threadId}`;
/** Where the provider's own paging left off, so scroll can pull the next page. */
const pageScope = (folderId: string) => `page:${folderId}`;

const snoozeScope = (threadId: string) => `snooze:${threadId}`;

/** wakeAt is kept in `cursor`; living in sync_state means sign-out wipes it with the mirror. */
export function setSnooze(
  db: LocalDB,
  providerId: string,
  threadId: string,
  wakeAt: string,
): Promise<void> {
  return setSyncState(db, snoozeScope(threadId), providerId, new Date().toISOString(), wakeAt);
}

export function clearSnooze(db: LocalDB, threadId: string): Promise<void> {
  return clearSyncState(db, [snoozeScope(threadId)]);
}

/** Threads whose wake time has passed. */
export async function dueSnoozes(db: LocalDB, now: number): Promise<string[]> {
  const rows = await listSyncStateByPrefix(db, 'snooze:');
  return rows
    .filter((r) => r.cursor && Date.parse(r.cursor) <= now)
    .map((r) => r.scope.slice('snooze:'.length));
}

export async function getPageCursor(db: LocalDB, folderId: string): Promise<string | null> {
  return (await getSyncState(db, pageScope(folderId)))?.cursor ?? null;
}

export function setPageCursor(
  db: LocalDB,
  providerId: string,
  folderId: string,
  cursor: string | null,
): Promise<void> {
  return setSyncState(db, pageScope(folderId), providerId, new Date().toISOString(), cursor);
}

async function isStale(db: LocalDB, scope: string, now: number): Promise<boolean> {
  const row = await getSyncState(db, scope);
  if (!row?.syncedAt) return true;
  return now - Date.parse(row.syncedAt) >= SYNC_TTL_MS;
}

export function folderStale(db: LocalDB, folderId: string, now: number): Promise<boolean> {
  return isStale(db, folderScope(folderId), now);
}

export function threadStale(db: LocalDB, threadId: string, now: number): Promise<boolean> {
  return isStale(db, threadScope(threadId), now);
}

export function markFolderSynced(
  db: LocalDB,
  providerId: string,
  folderId: string,
  cursor?: string | null,
): Promise<void> {
  return setSyncState(db, folderScope(folderId), providerId, new Date().toISOString(), cursor);
}

export function markThreadSynced(db: LocalDB, providerId: string, threadId: string): Promise<void> {
  return setSyncState(db, threadScope(threadId), providerId, new Date().toISOString());
}

export function invalidateThread(db: LocalDB, threadId: string): Promise<void> {
  return clearSyncState(db, [threadScope(threadId)]);
}

/** Prefix-scoped, so thread freshness survives. */
export function invalidateAllFolders(db: LocalDB): Promise<void> {
  return clearSyncStateByPrefix(db, 'folder:');
}

export function resetSyncState(db: LocalDB): Promise<void> {
  return clearSyncState(db);
}
