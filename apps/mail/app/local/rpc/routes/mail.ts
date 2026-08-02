import { z } from 'zod';
import type { LocalDB } from '../../db';
import type { ProviderId } from '../../auth';
import {
  getThreadBundles,
  getThreadMessages,
  getMessageAttachments,
  getAttachmentBody,
  setAttachmentBody,
  applyThreadLabels,
  findThreadsByFolderWithPagination,
  searchThreads,
  listOutboxDrafts,
  del,
} from '../../db';
import DOMPurify from 'dompurify';
import { toThreadDetail } from '../adapters';
import * as store from '../local-store';
import { bytesToBase64 } from '../../mail/mime';
import {
  threadStale,
  setSnooze,
  clearSnooze,
  invalidateAllFolders,
  resetSyncState,
} from '../sync-state';
import { dedupe, emitMirrorChanged } from '../dedupe';
import { queueSend, cancelSend } from '../outbox';
import {
  ATTACHMENT_CACHE_MAX_BYTES,
  PAGE_SIZE,
  UNDO_SEND_MS,
  claimRevalidate,
  isOffline,
  isOpenThread,
  modifyThread,
  refreshDrafts,
  revalidateTargets,
  scheduleFlush,
  syncNextPage,
  syncNextSearchPage,
  syncTargets,
  syncSearch,
  syncThread,
  toOutboxPayload,
  toggleLabel,
} from '../local-utils';
import { dbProcedure, driverProcedure, publicProcedure, router } from '../trpc';

const ids = z.object({ ids: z.array(z.string()) });
const threadId = z.object({ id: z.string() });

const sender = z.object({ name: z.string().optional(), email: z.string() });

/** What toOutboxPayload accepts: a comma-joined string, or a list of addresses/objects. */
const recipients = z.union([z.string(), z.array(z.union([z.string(), sender]))]);

/** serializeFiles() emits `base64`; an older shape used `data`. toOutboxPayload reads either. */
const attachment = z
  .object({
    name: z.string().optional(),
    filename: z.string().optional(),
    type: z.string().optional(),
    mimeType: z.string().optional(),
    size: z.number().optional(),
    lastModified: z.number().optional(),
    base64: z.string().optional(),
    data: z.string().optional(),
  })
  .passthrough();

/** Exported for router.check — the handler needs a driver, but the schema is pure and pinnable. */
export const listThreadsInput = z.object({
  folder: z.string().optional().default('inbox'),
  q: z.string().optional().default(''),
  maxResults: z.number().optional().default(PAGE_SIZE),
  cursor: z.string().optional().default(''),
  labelIds: z.array(z.string()).optional().default([]),
  senderEmail: z.string().optional(),
  domain: z.string().optional(),
});

interface ListArgs {
  db: LocalDB;
  providerId: ProviderId;
  folderId: string;
  labelIds: string[];
  cursor?: string;
  senderEmail?: string;
  domain?: string;
}

const renderThread = async (db: LocalDB, id: string) =>
  toThreadDetail((await getThreadBundles(db, [id])).get(id)!);

const toPage = async (
  db: LocalDB,
  page: { threads: { id: string }[]; nextPageToken: string | null },
) => {
  const ids = page.threads.map((t) => t.id);
  const bundles = await getThreadBundles(db, ids);
  return {
    threads: ids.map((id) => ({ id, historyId: null })),
    rows: ids.map((id) => ({ id, thread: toThreadDetail(bundles.get(id)!) })),
    nextPageToken: page.nextPageToken,
  };
};

const readFolder = (a: ListArgs) =>
  findThreadsByFolderWithPagination(a.db, a.folderId, {
    pageToken: a.cursor,
    maxResults: PAGE_SIZE,
    providerId: a.providerId,
    labelIds: a.labelIds,
    senderEmail: a.senderEmail,
    domain: a.domain,
  });

async function draftPage(db: LocalDB, providerId: ProviderId) {
  const local = await listOutboxDrafts(db, providerId, PAGE_SIZE);
  await refreshDrafts(db, PAGE_SIZE, local.length === 0);
  const rows = local.length ? local : await listOutboxDrafts(db, providerId, PAGE_SIZE);
  return toPage(db, { threads: rows, nextPageToken: null });
}

async function searchPage(a: ListArgs, q: string) {
  const read = () =>
    searchThreads(a.db, {
      searchText: q,
      maxResults: PAGE_SIZE,
      providerId: a.providerId,
      pageToken: a.cursor,
    });

  const cached = await read();
  if (isOffline()) return toPage(a.db, cached);
  const key = `search:${q}`;

  // Scrolling the results: the mirror is dry but the provider may have more hits.
  if (a.cursor) {
    if (cached.threads.length > 0) return toPage(a.db, cached);
    await dedupe(`page:${key}`, () => syncNextSearchPage(a.db, q));
    return toPage(a.db, await read());
  }

  // Unlike a folder, this awaits the refresh — stale hits for a term just typed read as wrong.
  if (claimRevalidate(key)) await dedupe(key, () => syncSearch(a.db, q));
  return toPage(a.db, await read());
}

async function folderPage(a: ListArgs) {
  const read = () => readFolder(a);

  // Scrolled past what's mirrored: deepen it by one provider page, then re-read.
  if (a.cursor) {
    const page = await read();
    if (page.threads.length > 0 || isOffline()) return toPage(a.db, page);
    await dedupe(`page:${a.folderId}`, () => syncNextPage(a.db, a.folderId).then(() => undefined));
    return toPage(a.db, await read());
  }

  // A selected label's threads may not be in the folder page we mirrored, so fetch by label.
  const targets = a.labelIds.length ? a.labelIds : [a.folderId];
  const cached = await read();
  if (isOffline()) return toPage(a.db, cached);

  if (cached.threads.length === 0) {
    if (claimRevalidate(targets.join('|'))) await syncTargets(a.db, targets);
    return toPage(a.db, await read());
  }

  // Rows to show: serve them now, refresh behind the response.
  revalidateTargets(a.db, targets);
  return toPage(a.db, cached);
}

export const mailRouter = router({
  listThreads: driverProcedure.input(listThreadsInput).query(({ ctx, input }) => {
    const folder = input.folder.toLowerCase();
    if (folder === 'draft' || folder === 'drafts') return draftPage(ctx.db, ctx.codec.id);

    const isSnoozed = folder === 'snoozed';
    const args: ListArgs = {
      db: ctx.db,
      providerId: ctx.codec.id,
      folderId: isSnoozed ? 'SNOOZED' : ctx.codec.folderKey(input.folder),
      labelIds: input.labelIds,
      cursor: input.cursor || undefined,
      senderEmail: input.senderEmail,
      domain: input.domain,
    };

    // SNOOZED is a label only the mirror knows about, so this view reads and never syncs.
    if (isSnoozed) return readFolder(args).then((page) => toPage(ctx.db, page));

    const q = input.q.trim();
    return q ? searchPage(args, q) : folderPage(args);
  }),

  get: driverProcedure.input(threadId).query(async ({ ctx, input }) => {
    const { db } = ctx;
    const render = () => renderThread(db, input.id);

    if (isOffline() || !isOpenThread(input.id)) return render();

    if ((await getThreadMessages(db, input.id)).length === 0) {
      await syncThread(db, input.id);
      return render();
    }

    if (await threadStale(db, input.id, Date.now())) {
      void dedupe(`thread:${input.id}`, async () => {
        try {
          await syncThread(db, input.id);
          emitMirrorChanged();
        } catch (e) {
          console.warn(`syncThread(${input.id}) failed, serving mirror`, e);
        }
      });
    }

    return render();
  }),

  markAsRead: driverProcedure.input(ids).mutation(async ({ input }) => {
    await Promise.all(input.ids.map((id) => modifyThread(id, [], ['UNREAD'])));
    return { success: true };
  }),

  markAsUnread: driverProcedure.input(ids).mutation(async ({ input }) => {
    await Promise.all(input.ids.map((id) => modifyThread(id, ['UNREAD'], [])));
    return { success: true };
  }),

  toggleStar: driverProcedure.input(ids).mutation(async ({ input }) => {
    await Promise.all(input.ids.map((id) => toggleLabel(id, 'STARRED')));
    return { success: true };
  }),

  toggleImportant: driverProcedure.input(ids).mutation(async ({ input }) => {
    await Promise.all(input.ids.map((id) => toggleLabel(id, 'IMPORTANT')));
    return { success: true };
  }),

  modifyLabels: driverProcedure
    .input(
      z.object({
        threadId: z.union([z.string(), z.array(z.string())]),
        addLabels: z.array(z.string()).optional().default([]),
        removeLabels: z.array(z.string()).optional().default([]),
      }),
    )
    .mutation(async ({ input }) => {
      const targets = Array.isArray(input.threadId) ? input.threadId : [input.threadId];
      await Promise.all(
        targets.filter(Boolean).map((id) => modifyThread(id, input.addLabels, input.removeLabels)),
      );
      return { success: true };
    }),

  send: driverProcedure
    .input(
      z.object({
        to: recipients,
        subject: z.string().optional().default(''),
        message: z.string().optional().default(''),
        attachments: z.array(attachment).optional().default([]),
        headers: z.record(z.string()).optional().default({}),
        cc: recipients.optional(),
        bcc: recipients.optional(),
        threadId: z.string().nullish(),
        fromEmail: z.string().optional(),
        draftId: z.string().nullish(),
        isForward: z.boolean().optional(),
        originalMessage: z.string().optional(),
        scheduleAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const payload = toOutboxPayload(input);
      const scheduled = input.scheduleAt ? Date.parse(input.scheduleAt) : NaN;
      const undoMs = store.getSettings().undoSendEnabled ? UNDO_SEND_MS : 0;
      const sendAfter = Number.isFinite(scheduled) ? scheduled : Date.now() + undoMs;

      const id = await queueSend(ctx.db, {
        draftId: input.draftId ?? null,
        threadId: input.threadId ?? null,
        payload,
        sendAfter,
      });

      scheduleFlush(sendAfter - Date.now());

      return {
        queued: true as const,
        messageId: id,
        sendAt: sendAfter,
        success: true,
        id,
        threadId: input.threadId ?? null,
      };
    }),

  unsend: dbProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const cancelled = await cancelSend(ctx.db, input.messageId);
      if (!cancelled) throw new Error('Message has already been sent');
      return { success: true };
    }),

  delete: driverProcedure.input(threadId).mutation(async ({ ctx, input }) => {
    await ctx.driver.trashThread(input.id);
    await del(ctx.db, { id: input.id });
    await invalidateAllFolders(ctx.db);
    emitMirrorChanged();
    return true;
  }),

  bulkArchive: driverProcedure.input(ids).mutation(async ({ input }) => {
    await Promise.all(input.ids.map((id) => modifyThread(id, [], ['INBOX'])));
    return { success: true };
  }),

  bulkDelete: driverProcedure.input(ids).mutation(async ({ ctx, input }) => {
    await Promise.all(
      input.ids.map(async (id) => {
        await ctx.driver.trashThread(id);
        await del(ctx.db, { id });
      }),
    );
    await invalidateAllFolders(ctx.db);
    emitMirrorChanged();
    return { success: true };
  }),

  getEmailAliases: driverProcedure.query(({ ctx }) => ctx.driver.getEmailAliases()),

  // Force-sync = drop every TTL so the next read re-pulls from the provider.
  forceSync: dbProcedure.mutation(async ({ ctx }) => {
    await resetSyncState(ctx.db);
    return { success: true };
  }),

  snoozeThreads: driverProcedure
    .input(z.object({ ids: z.array(z.string()), wakeAt: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!input.ids.length) return { success: false, error: 'No thread IDs provided' };
      const inbox = ctx.codec.folderKey('inbox');
      const wakeAt = input.wakeAt ?? new Date().toISOString();

      await Promise.all(
        input.ids.map(async (id) => {
          await applyThreadLabels(ctx.db, id, ['SNOOZED'], [inbox]);
          await setSnooze(ctx.db, ctx.codec.id, id, wakeAt);
        }),
      );
      return { success: true };
    }),

  unsnoozeThreads: driverProcedure.input(ids).mutation(async ({ ctx, input }) => {
    if (!input.ids.length) return { success: false, error: 'No thread IDs' };
    const inbox = ctx.codec.folderKey('inbox');

    await Promise.all(
      input.ids.map(async (id) => {
        await applyThreadLabels(ctx.db, id, [inbox], ['SNOOZED']);
        await clearSnooze(ctx.db, id);
      }),
    );
    return { success: true };
  }),

  processEmailContent: publicProcedure
    .input(
      z.object({
        html: z.string(),
        shouldLoadImages: z.boolean().optional(),
        theme: z.enum(['light', 'dark']).optional(),
      }),
    )
    .mutation(({ input }) => ({
      processedHtml: DOMPurify.sanitize(input.html),
      hasBlockedImages: false,
    })),

  getMessageAttachments: driverProcedure
    .input(z.object({ messageId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { messageId } = input;
      const atts = await getMessageAttachments(ctx.db, messageId);
      return Promise.all(
        atts.map(async (a) => {
          let body = (await getAttachmentBody(ctx.db, messageId, a.attachmentId)) ?? '';
          if (!body && a.attachmentId && !isOffline()) {
            try {
              const blob = await ctx.driver.getAttachment(messageId, a.attachmentId);
              body = bytesToBase64(blob.bytes);
              // Graph returns no contentBytes for item/reference attachments — caching '' would just
              // read back as a miss forever.
              if (blob.bytes.length > 0 && blob.bytes.length <= ATTACHMENT_CACHE_MAX_BYTES) {
                await setAttachmentBody(ctx.db, messageId, a.attachmentId, body);
              }
            } catch (e) {
              // Leave empty — the row still shows, just no preview/download.
              console.warn(`getAttachment(${a.attachmentId}) failed`, e);
            }
          }
          return {
            attachmentId: a.attachmentId,
            filename: a.filename ?? '',
            mimeType: a.mimeType ?? '',
            size: a.size ?? 0,
            body,
            headers: [],
          };
        }),
      );
    }),

  verifyEmail: publicProcedure.input(threadId).query(() => ({ verified: false })),

  suggestRecipients: publicProcedure
    .input(z.object({ query: z.string().optional(), limit: z.number().optional() }).optional())
    .query(() => [] as { name?: string; email: string }[]),
});
