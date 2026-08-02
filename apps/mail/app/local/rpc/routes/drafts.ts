import { z } from 'zod';
import { getOutbox, listOutboxDrafts } from '../../db';
import { saveDraft, discardDraft } from '../outbox';
import { PAGE_SIZE, isOffline, refreshDrafts, scheduleFlush, toOutboxPayload } from '../local-utils';
import { dbProcedure, driverProcedure, router } from '../trpc';

/** Mirrors the server's createDraftData — the composer sends comma-joined recipient strings. */
const draftInput = z.object({
  to: z.string(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string(),
  message: z.string(),
  attachments: z.array(z.any()).optional(),
  id: z.string().nullish(),
  threadId: z.string().nullish(),
  fromEmail: z.string().nullish(),
});

export const draftsRouter = router({
  create: dbProcedure.input(draftInput).mutation(async ({ ctx, input }) => {
    const id = await saveDraft(ctx.db, {
      id: input.id ?? null,
      threadId: input.threadId ?? null,
      payload: toOutboxPayload(input),
    });
    scheduleFlush(0);
    return { id, success: true };
  }),

  get: driverProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const row = await getOutbox(ctx.db, input.id);

    // A draft the mirror hasn't pulled yet (opened straight from a link, say) still has to render.
    if (!row) {
      if (isOffline()) throw new Error('Draft not available offline');
      return ctx.driver.getDraft(input.id);
    }

    return {
      id: row.id,
      to: row.payload.to,
      cc: row.payload.cc ?? [],
      bcc: row.payload.bcc ?? [],
      subject: row.payload.subject,
      content: row.payload.html,
      rawAttachments: row.payload.attachments ?? [],
    };
  }),

  list: driverProcedure
    .input(
      z
        .object({
          q: z.string().optional(),
          maxResults: z.number().optional(),
          pageToken: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const maxResults = input?.maxResults ?? PAGE_SIZE;
      const { db, codec } = ctx;

      const local = await listOutboxDrafts(db, codec.id, maxResults);
      await refreshDrafts(db, maxResults, local.length === 0);
      const rows = local.length ? local : await listOutboxDrafts(db, codec.id, maxResults);
      return { threads: rows.map((r) => ({ id: r.id, historyId: null })), nextPageToken: null };
    }),

  delete: dbProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await discardDraft(ctx.db, input.id);
    scheduleFlush(0);
    return true;
  }),
});
