// Per-folder/thread "last synced at" timestamps gating the resolver's provider sync (see SYNC_TTL). Standalone to avoid an import cycle.
export const folderSyncedAt = new Map<string, number>();
export const threadSyncedAt = new Map<string, number>();

export function resetSyncState(): void {
  folderSyncedAt.clear();
  threadSyncedAt.clear();
}
