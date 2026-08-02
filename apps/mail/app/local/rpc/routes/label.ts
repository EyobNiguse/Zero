import { z } from 'zod';
import { getFolders, type Folder } from '../../db';
import { folderStale, TREE_SCOPE } from '../sync-state';
import { isOffline, refreshFolderTree, syncFolderTree } from '../local-utils';
import { driverProcedure, router } from '../trpc';

const labelColor = z.object({ backgroundColor: z.string(), textColor: z.string() });

function toTree(rows: Folder[]) {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of rows) {
    const siblings = byParent.get(f.parentId ?? null) ?? [];
    siblings.push(f);
    byParent.set(f.parentId ?? null, siblings);
  }

  // Role folders are 'system' so they don't duplicate the static nav (Inbox/Sent/Archive/…), but
  // they stay in the payload with `role` set — the nav hangs their user subfolders off them.
  const toLabel = (f: Folder): any => {
    const children = byParent.get(f.id) ?? [];
    return {
      id: f.id,
      name: f.name,
      color: undefined,
      type: f.role ? 'system' : 'user',
      role: f.role ?? null,
      unread: f.unread ?? 0,
      total: f.total ?? 0,
      labels: children.length ? children.map(toLabel) : undefined,
    };
  };

  return (byParent.get(null) ?? []).map(toLabel);
}

export const labelsRouter = router({
  list: driverProcedure.query(async ({ ctx }) => {
    let rows = await getFolders(ctx.db, ctx.codec.id);

    // Nothing mirrored yet, or the tree is past its TTL.
    const nothingMirrored = rows.length === 0;
    const treeExpired = await folderStale(ctx.db, TREE_SCOPE, Date.now());

    if ((nothingMirrored || treeExpired) && !isOffline()) {
      try {
        await syncFolderTree(ctx.db);
        rows = await getFolders(ctx.db, ctx.codec.id);
      } catch (e) {
        // Serve the mirror rather than blank the sidebar on a transient provider failure.
        console.warn('syncFolderTree failed, serving mirror', e);
      }
    }
    return toTree(rows);
  }),

  // Each mutates the tree at the provider, so the mirror's copy is stale the moment the call returns
  // — re-read the tree here rather than leaving it to whenever something next asks for it.
  create: driverProcedure
    .input(z.object({ name: z.string(), color: labelColor.optional() }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.driver.createLabel(input);
      await refreshFolderTree();
      return res;
    }),

  update: driverProcedure
    .input(z.object({ id: z.string(), name: z.string(), color: labelColor.optional() }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.driver.updateLabel(input.id, { name: input.name, color: input.color });
      await refreshFolderTree();
      return res;
    }),

  delete: driverProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.driver.deleteLabel(input.id);
    await refreshFolderTree();
    return { success: true };
  }),
});
