/**
 * Ported from apps/server/src/routes/agent/db/index.ts (only the DB type binding changed).
 * db.transaction helpers throw under sqlite-proxy until moved onto the batch path.
 */
import { eq, count, inArray, notInArray, and, sql, desc, asc, lt, like, or } from 'drizzle-orm';
import {
  threads,
  threadLabels,
  labels,
  messages,
  attachments,
  folders,
  syncState,
  outbox,
  type Sender,
} from './schema';
import type { LocalDB } from './client';

export type DB = LocalDB;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;
export type AttachmentMeta = Omit<Attachment, 'body'>;
export type Folder = typeof folders.$inferSelect;
export type InsertFolder = typeof folders.$inferInsert;

/** Structural subset shared by the top-level DB and a transaction handle (which omits .batch). */
type WritableDB = Pick<LocalDB, 'select' | 'insert' | 'delete' | 'update'>;

export type Thread = typeof threads.$inferSelect;
export type InsertThread = typeof threads.$inferInsert;
export type ThreadLabel = typeof threadLabels.$inferSelect;
export type InsertThreadLabel = typeof threadLabels.$inferInsert;
export type Label = typeof labels.$inferSelect;
export type InsertLabel = typeof labels.$inferInsert;

// Reusable thread selection object to reduce duplication
const threadSelect = {
  id: threads.id,
  threadId: threads.threadId,
  providerId: threads.providerId,
  latestSender: threads.latestSender,
  latestReceivedOn: threads.latestReceivedOn,
  latestSubject: threads.latestSubject,
  replyCount: threads.replyCount,
} as const;

const attachmentMetaSelect = {
  id: attachments.id,
  messageId: attachments.messageId,
  attachmentId: attachments.attachmentId,
  filename: attachments.filename,
  mimeType: attachments.mimeType,
  size: attachments.size,
  inline: attachments.inline,
  contentId: attachments.contentId,
} as const;

async function createMissingLabels(db: WritableDB, labelIds: string[]): Promise<void> {
  if (labelIds.length === 0) return;

  const existingLabels = await db
    .select({ id: labels.id })
    .from(labels)
    .where(inArray(labels.id, labelIds));

  const existingLabelIds = new Set(existingLabels.map((label) => label.id));
  const missingLabelIds = labelIds.filter((id) => !existingLabelIds.has(id));

  if (missingLabelIds.length > 0) {
    const newLabels: InsertLabel[] = missingLabelIds.map((id) => ({
      id,
      name: id,
      color: '#000000',
    }));

    await db.insert(labels).values(newLabels).onConflictDoNothing();
  }
}

export async function create(db: DB, thread: InsertThread, labelIds?: string[]): Promise<Thread> {
  return await db.transaction(async (tx) => {
    // Create the thread first
    const [res] = await tx
      .insert(threads)
      .values(thread)
      .onConflictDoUpdate({
        target: [threads.id],
        set: thread,
      })
      .returning();

    if (labelIds && labelIds.length > 0) {
      // Ensure all labels exist (create missing ones)
      await createMissingLabels(tx, labelIds);

      // Create thread-label relationships
      const threadLabelInserts: InsertThreadLabel[] = labelIds.map((labelId) => ({
        threadId: thread.id,
        labelId,
      }));

      await tx.insert(threadLabels).values(threadLabelInserts).onConflictDoNothing();
    }

    return res;
  });
}

/** Labels the provider knows nothing about — a replace must not sweep them away. */
const LOCAL_ONLY_LABELS = ['SNOOZED'];


export async function hydrateThreads(
  db: DB,
  items: { thread: InsertThread; labelIds: string[] }[],
  opts: { replaceLabels?: boolean } = {},
): Promise<void> {
  if (items.length === 0) return;

  // One insert per referenced label (deduped); name/color are placeholders until a real label sync.
  const labelIdSet = new Set<string>();
  for (const { labelIds } of items) for (const id of labelIds) labelIdSet.add(id);

  const stmts = [];

  if (labelIdSet.size > 0) {
    const labelRows: InsertLabel[] = [...labelIdSet].map((id) => ({
      id,
      name: id,
      color: '#000000',
    }));
    stmts.push(db.insert(labels).values(labelRows).onConflictDoNothing());
  }

  for (const { thread } of items) {
    stmts.push(
      db.insert(threads).values(thread).onConflictDoUpdate({ target: [threads.id], set: thread }),
    );
  }

  if (opts.replaceLabels) {
    for (const { thread, labelIds } of items) {
      const keep = [...labelIds, ...LOCAL_ONLY_LABELS];
      stmts.push(
        db
          .delete(threadLabels)
          .where(
            and(eq(threadLabels.threadId, thread.id), notInArray(threadLabels.labelId, keep)),
          ),
      );
    }
  }

  const threadLabelRows: InsertThreadLabel[] = [];
  for (const { thread, labelIds } of items) {
    for (const labelId of labelIds) threadLabelRows.push({ threadId: thread.id, labelId });
  }
  if (threadLabelRows.length > 0) {
    stmts.push(db.insert(threadLabels).values(threadLabelRows).onConflictDoNothing());
  }

  // stmts is a dynamic array; drizzle's batch signature wants a non-empty tuple.
  await db.batch(stmts as unknown as Parameters<typeof db.batch>[0]);
}

export async function pruneFolderMembership(
  db: DB,
  folderId: string,
  presentThreadIds: string[],
  since: string,
): Promise<void> {
  const stale = await db
    .select({ id: threads.id })
    .from(threads)
    .innerJoin(threadLabels, eq(threadLabels.threadId, threads.id))
    .where(
      and(
        eq(threadLabels.labelId, folderId),
        sql`${threads.latestReceivedOn} >= ${since}`,
        presentThreadIds.length ? notInArray(threads.id, presentThreadIds) : sql`1 = 1`,
      ),
    );
  if (stale.length === 0) return;

  await db.delete(threadLabels).where(
    and(
      eq(threadLabels.labelId, folderId),
      inArray(
        threadLabels.threadId,
        stale.map((t) => t.id),
      ),
    ),
  );
}

/** Persist a thread's messages + attachment metadata (batch path, idempotent). */
export async function hydrateMessages(
  db: DB,
  msgs: InsertMessage[],
  atts: InsertAttachment[],
): Promise<void> {
  if (msgs.length === 0) return;

  const stmts = [];

  for (const m of msgs) {
    stmts.push(db.insert(messages).values(m).onConflictDoUpdate({ target: [messages.id], set: m }));
  }

  // Upsert attachments on (message_id, attachment_id) instead of clearing the message's rows: a
  // re-sync must not throw away the cached `body` of an attachment the user already downloaded.
  // Rows the provider no longer lists are dropped separately, below.
  const keepByMessage = new Map<string, string[]>();
  for (const a of atts) {
    const ids = keepByMessage.get(a.messageId) ?? [];
    ids.push(a.attachmentId);
    keepByMessage.set(a.messageId, ids);
  }

  for (const m of msgs) {
    const keep = keepByMessage.get(m.id) ?? [];
    stmts.push(
      db
        .delete(attachments)
        .where(
          keep.length
            ? and(eq(attachments.messageId, m.id), notInArray(attachments.attachmentId, keep))
            : eq(attachments.messageId, m.id),
        ),
    );
  }

  for (const a of atts) {
    stmts.push(
      db
        .insert(attachments)
        .values(a)
        .onConflictDoUpdate({
          target: [attachments.messageId, attachments.attachmentId],
          set: {
            filename: a.filename ?? null,
            mimeType: a.mimeType ?? null,
            size: a.size ?? null,
            inline: a.inline ?? false,
            contentId: a.contentId ?? null,
          },
        }),
    );
  }

  await db.batch(stmts as unknown as Parameters<typeof db.batch>[0]);
}

/** Persist the fetched bytes of one attachment so it opens offline next time. */
export async function setAttachmentBody(
  db: DB,
  messageId: string,
  attachmentId: string,
  body: string,
): Promise<void> {
  await db
    .update(attachments)
    .set({ body })
    .where(and(eq(attachments.messageId, messageId), eq(attachments.attachmentId, attachmentId)));
}

export async function getThreadMessages(db: DB, threadId: string): Promise<Message[]> {
  return await db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(asc(messages.receivedOn));
}

export interface ThreadBundle {
  thread: Thread | null;
  messages: Message[];
  labels: Label[];
  /** Keyed by message id. Metadata only — cached bytes never enter a render read. */
  attachments: Map<string, AttachmentMeta[]>;
}

export async function getThreadBundles(
  db: DB,
  threadIds: string[],
): Promise<Map<string, ThreadBundle>> {
  const out = new Map<string, ThreadBundle>();
  if (threadIds.length === 0) return out;
  for (const id of threadIds) {
    out.set(id, { thread: null, messages: [], labels: [], attachments: new Map() });
  }

  const threadRows = await db.select().from(threads).where(inArray(threads.id, threadIds));
  for (const t of threadRows) out.get(t.id)!.thread = t;

  const messageRows = await db
    .select()
    .from(messages)
    .where(inArray(messages.threadId, threadIds))
    .orderBy(asc(messages.receivedOn));
  for (const m of messageRows) out.get(m.threadId)?.messages.push(m);

  const labelRows = await db
    .select({
      threadId: threadLabels.threadId,
      id: labels.id,
      name: labels.name,
      color: labels.color,
    })
    .from(labels)
    .innerJoin(threadLabels, eq(labels.id, threadLabels.labelId))
    .where(inArray(threadLabels.threadId, threadIds));
  for (const { threadId, ...label } of labelRows) out.get(threadId)?.labels.push(label);

  if (messageRows.length > 0) {
    const threadOfMessage = new Map(messageRows.map((m) => [m.id, m.threadId]));
    const attachmentRows = await db
      .select(attachmentMetaSelect)
      .from(attachments)
      .where(
        inArray(
          attachments.messageId,
          messageRows.map((m) => m.id),
        ),
      );
    for (const a of attachmentRows) {
      const bundle = out.get(threadOfMessage.get(a.messageId)!);
      if (!bundle) continue;
      bundle.attachments.set(a.messageId, [...(bundle.attachments.get(a.messageId) ?? []), a]);
    }
  }

  return out;
}

/** Metadata only. Cached bytes are megabytes wide, so they are never in a thread-render read. */
export async function getMessageAttachments(db: DB, messageId: string): Promise<AttachmentMeta[]> {
  return await db
    .select(attachmentMetaSelect)
    .from(attachments)
    .where(eq(attachments.messageId, messageId));
}

/** Cached base64 bytes for one attachment, or null if it was never fetched (or was too big to keep). */
export async function getAttachmentBody(
  db: DB,
  messageId: string,
  attachmentId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ body: attachments.body })
    .from(attachments)
    .where(and(eq(attachments.messageId, messageId), eq(attachments.attachmentId, attachmentId)));
  return row?.body ?? null;
}

export async function createLabel(db: DB, label: InsertLabel): Promise<Label> {
  const [res] = await db
    .insert(labels)
    .values(label)
    .onConflictDoUpdate({
      target: [labels.id],
      set: label,
    })
    .returning();
  return res;
}

export async function getLabel(db: DB, labelId: string): Promise<Label | null> {
  const [result] = await db.select().from(labels).where(eq(labels.id, labelId));
  return result || null;
}

export async function getLabels(db: DB): Promise<Label[]> {
  return await db.select().from(labels);
}

export async function ensureLabelsExist(db: DB, labelIds: string[]): Promise<string[]> {
  await createMissingLabels(db, labelIds);
  return labelIds;
}

/** Add + remove labels on a thread without a transaction (provider call is the source of truth). */
export async function applyThreadLabels(
  db: DB,
  threadId: string,
  add: string[],
  remove: string[],
): Promise<void> {
  if (remove.length > 0) {
    await db
      .delete(threadLabels)
      .where(and(eq(threadLabels.threadId, threadId), inArray(threadLabels.labelId, remove)));
  }
  if (add.length > 0) {
    await ensureLabelsExist(db, add);
    await db
      .insert(threadLabels)
      .values(add.map((labelId) => ({ threadId, labelId })))
      .onConflictDoNothing();
  }
}

/** Wipe the entire local mirror on sign-out / provider switch (children first). */
export async function clearMirror(db: DB): Promise<void> {
  await db.batch([
    db.delete(threadLabels),
    db.delete(attachments),
    db.delete(messages),
    db.delete(labels),
    db.delete(threads),
    db.delete(folders),
    db.delete(syncState),
    // Drafts and queued sends are mailbox content too — sign-out must not leave them on the device.
    db.delete(outbox),
  ] as unknown as Parameters<typeof db.batch>[0]);
}

export async function del(db: DB, params: { id: string }): Promise<Thread | null> {
  const [thread] = await db.delete(threads).where(eq(threads.id, params.id)).returning();
  return thread || null;
}

export async function deleteSpamThreads(
  db: DB,
): Promise<{ deletedCount: number; deletedThreads: Thread[] }> {
  return await db.transaction(async (tx) => {
    const spamThreads = await tx
      .select(threadSelect)
      .from(threads)
      .innerJoin(threadLabels, eq(threads.id, threadLabels.threadId))
      .where(eq(threadLabels.labelId, 'SPAM'));

    if (spamThreads.length === 0) {
      return { deletedCount: 0, deletedThreads: [] };
    }

    const spamThreadIds = spamThreads.map((thread) => thread.id);

    const deletedThreads = await tx
      .delete(threads)
      .where(inArray(threads.id, spamThreadIds))
      .returning();

    return { deletedCount: deletedThreads.length, deletedThreads };
  });
}

export async function get(db: DB, params: { id: string }): Promise<Thread | null> {
  const [result] = await db.select().from(threads).where(eq(threads.id, params.id));
  return result || null;
}

/** List thread summaries, newest first; optional provider/label filters. */
export async function list(
  db: DB,
  opts: { providerId?: string; labelId?: string } = {},
): Promise<Thread[]> {
  const { providerId, labelId } = opts;
  const conds = [];
  if (providerId) conds.push(eq(threads.providerId, providerId));
  if (labelId) conds.push(eq(threadLabels.labelId, labelId));
  const where = conds.length ? and(...conds) : undefined;

  if (labelId) {
    const rows = await db
      .select()
      .from(threads)
      .innerJoin(threadLabels, eq(threads.id, threadLabels.threadId))
      .where(where)
      .orderBy(desc(threads.latestReceivedOn));
    return rows.map((r) => r.threads);
  }

  return await db.select().from(threads).where(where).orderBy(desc(threads.latestReceivedOn));
}

export async function countThreads(db: DB): Promise<number> {
  const [result] = await db.select({ count: count() }).from(threads);
  return result.count;
}

export async function countThreadsByLabels(
  db: DB,
  labelIds: string[],
): Promise<{ labelId: string; count: number }[]> {
  if (labelIds.length === 0) return [];

  const results = await db
    .select({ labelId: threadLabels.labelId, count: count() })
    .from(threadLabels)
    .where(inArray(threadLabels.labelId, labelIds))
    .groupBy(threadLabels.labelId);

  return results;
}

export async function createThreadLabel(
  db: DB,
  threadLabel: InsertThreadLabel,
): Promise<ThreadLabel | null> {
  const [res] = await db.insert(threadLabels).values(threadLabel).onConflictDoNothing().returning();
  return res || null;
}

export async function deleteThreadLabel(
  db: DB,
  params: { threadId: string; labelId: string },
): Promise<void> {
  await db
    .delete(threadLabels)
    .where(
      and(eq(threadLabels.threadId, params.threadId), eq(threadLabels.labelId, params.labelId)),
    );
}

export async function getThreadLabels(db: DB, threadId: string): Promise<Label[]> {
  const results = await db
    .select({
      id: labels.id,
      name: labels.name,
      color: labels.color,
    })
    .from(labels)
    .innerJoin(threadLabels, eq(labels.id, threadLabels.labelId))
    .where(eq(threadLabels.threadId, threadId));
  return results;
}

export async function getLabelThreads(db: DB, labelId: string): Promise<Thread[]> {
  const results = await db
    .select(threadSelect)
    .from(threads)
    .innerJoin(threadLabels, eq(threads.id, threadLabels.threadId))
    .where(eq(threadLabels.labelId, labelId));
  return results;
}

export async function updateThreadLabels(
  db: DB,
  threadId: string,
  labelIds: string[],
): Promise<void> {
  return await db.transaction(async (tx) => {
    // Ensure all labels exist first
    await createMissingLabels(tx, labelIds);

    // Delete existing thread labels
    await tx.delete(threadLabels).where(eq(threadLabels.threadId, threadId));

    if (labelIds.length > 0) {
      const threadLabelInserts: InsertThreadLabel[] = labelIds.map((labelId) => ({
        threadId,
        labelId,
      }));

      await tx.insert(threadLabels).values(threadLabelInserts);
    }
  });
}

export async function addThreadLabels(db: DB, threadId: string, labelIds: string[]): Promise<void> {
  if (labelIds.length === 0) return;

  return await db.transaction(async (tx) => {
    // Ensure all labels exist first
    await createMissingLabels(tx, labelIds);

    // Get existing label IDs for this thread
    const existing = await tx
      .select({ labelId: threadLabels.labelId })
      .from(threadLabels)
      .where(eq(threadLabels.threadId, threadId));

    const existingLabelIds = new Set(existing.map((row) => row.labelId));

    // Filter out labels that already exist
    const newLabelIds = labelIds.filter((labelId) => !existingLabelIds.has(labelId));

    if (newLabelIds.length > 0) {
      const threadLabelInserts: InsertThreadLabel[] = newLabelIds.map((labelId) => ({
        threadId,
        labelId,
      }));

      await tx.insert(threadLabels).values(threadLabelInserts);
    }
  });
}

export async function removeThreadLabels(
  db: DB,
  threadId: string,
  labelIds: string[],
): Promise<void> {
  if (labelIds.length === 0) return;

  await db
    .delete(threadLabels)
    .where(and(eq(threadLabels.threadId, threadId), inArray(threadLabels.labelId, labelIds)));
}

export async function modifyThreadLabels(
  db: DB,
  threadId: string,
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<{ addedLabels: string[]; removedLabels: string[] }> {
  return await db.transaction(async (tx) => {
    // Remove labels first
    if (removeLabelIds.length > 0) {
      await tx
        .delete(threadLabels)
        .where(
          and(eq(threadLabels.threadId, threadId), inArray(threadLabels.labelId, removeLabelIds)),
        );
    }

    // Add new labels
    if (addLabelIds.length > 0) {
      // Ensure all labels exist first
      await createMissingLabels(tx, addLabelIds);

      // Get existing label IDs for this thread (after removal)
      const existing = await tx
        .select({ labelId: threadLabels.labelId })
        .from(threadLabels)
        .where(eq(threadLabels.threadId, threadId));

      const existingLabelIds = new Set(existing.map((row) => row.labelId));

      // Filter out labels that already exist
      const newLabelIds = addLabelIds.filter((labelId) => !existingLabelIds.has(labelId));

      if (newLabelIds.length > 0) {
        const threadLabelInserts: InsertThreadLabel[] = newLabelIds.map((labelId) => ({
          threadId,
          labelId,
        }));

        await tx.insert(threadLabels).values(threadLabelInserts);
      }

      return { addedLabels: newLabelIds, removedLabels: removeLabelIds };
    }

    return { addedLabels: [], removedLabels: removeLabelIds };
  });
}

export async function findThreadsWithAllLabels(db: DB, labelIds: string[]): Promise<Thread[]> {
  if (labelIds.length === 0) {
    return await list(db);
  }

  const results = await db
    .select(threadSelect)
    .from(threads)
    .where(
      eq(
        db
          .select({ count: count() })
          .from(threadLabels)
          .where(
            and(eq(threadLabels.threadId, threads.id), inArray(threadLabels.labelId, labelIds)),
          ),
        labelIds.length,
      ),
    )
    .orderBy(desc(threads.latestReceivedOn));

  return results;
}

export async function findThreadsWithAnyLabels(db: DB, labelIds: string[]): Promise<Thread[]> {
  if (labelIds.length === 0) {
    return await list(db);
  }

  const results = await db
    .select(threadSelect)
    .from(threads)
    .innerJoin(threadLabels, eq(threads.id, threadLabels.threadId))
    .where(inArray(threadLabels.labelId, labelIds))
    .groupBy(threads.id)
    .orderBy(desc(threads.latestReceivedOn));

  return results;
}

export async function findThreadsWithLabel(db: DB, labelId: string): Promise<Thread[]> {
  const results = await db
    .select(threadSelect)
    .from(threads)
    .innerJoin(threadLabels, eq(threads.id, threadLabels.threadId))
    .where(eq(threadLabels.labelId, labelId))
    .orderBy(desc(threads.latestReceivedOn));

  return results;
}

/**
 * Mailbox-wide text search over the mirror, matching both providers' semantics ($search / q are
 * mailbox-wide, not folder-scoped). Same composite keyset as the folder listing.
 */
export async function searchThreads(
  db: DB,
  params: {
    searchText: string;
    maxResults: number;
    providerId?: string;
    pageToken?: string;
  },
): Promise<{ threads: Thread[]; nextPageToken: string | null }> {
  const { searchText, maxResults, providerId, pageToken } = params;
  const term = `%${searchText}%`;

  const conditions = [
    or(
      like(threads.latestSubject, term),
      like(threads.latestSender, term),
      // Body/snippet live on messages; a thread matches if any of its messages does.
      sql`exists (select 1 from ${messages} where ${messages.threadId} = ${threads.id} and (${messages.snippet} like ${term} or ${messages.bodyText} like ${term} or ${messages.subject} like ${term}))`,
    )!,
  ];

  if (providerId) conditions.push(eq(threads.providerId, providerId));

  if (pageToken) {
    const split = pageToken.lastIndexOf('|');
    const ts = split === -1 ? pageToken : pageToken.slice(0, split);
    const id = split === -1 ? null : pageToken.slice(split + 1);
    conditions.push(
      id === null
        ? lt(threads.latestReceivedOn, ts)
        : or(
            lt(threads.latestReceivedOn, ts),
            and(eq(threads.latestReceivedOn, ts), lt(threads.id, id)),
          )!,
    );
  }

  const results = await db
    .select(threadSelect)
    .from(threads)
    .where(and(...conditions))
    .orderBy(desc(threads.latestReceivedOn), desc(threads.id))
    .limit(maxResults + 1);

  const hasNextPage = results.length > maxResults;
  const threadResults = hasNextPage ? results.slice(0, maxResults) : results;
  const last = threadResults[threadResults.length - 1];
  const nextPageToken =
    hasNextPage && last?.latestReceivedOn ? `${last.latestReceivedOn}|${last.id}` : null;

  return { threads: threadResults, nextPageToken };
}

export async function findThreadsWithTextSearch(db: DB, searchText: string): Promise<Thread[]> {
  const results = await db
    .select(threadSelect)
    .from(threads)
    .where(
      or(
        like(threads.latestSubject, `%${searchText}%`),
        like(threads.latestSender, `%${searchText}%`),
      ),
    )
    .orderBy(desc(threads.latestReceivedOn));

  return results;
}

// Helper function to build label filtering conditions
function buildLabelConditions(db: DB, labelIds: string[], requireAllLabels: boolean) {
  if (labelIds.length === 0) return null;

  if (requireAllLabels) {
    return eq(
      db
        .select({ count: count() })
        .from(threadLabels)
        .where(and(eq(threadLabels.threadId, threads.id), inArray(threadLabels.labelId, labelIds))),
      labelIds.length,
    );
  } else {
    // Use EXISTS for better performance with any labels
    return sql`EXISTS (
      SELECT 1 FROM ${threadLabels}
      WHERE ${threadLabels.threadId} = ${threads.id}
      AND ${threadLabels.labelId} IN ${labelIds}
    )`;
  }
}

// Helper function to build text search conditions
function buildTextSearchConditions(searchText: string) {
  return or(
    like(threads.latestSubject, `%${searchText}%`),
    like(threads.latestSender, `%${searchText}%`),
  );
}

// Helper function to build pagination conditions
function buildPaginationConditions(pageToken: string) {
  return lt(threads.latestReceivedOn, pageToken);
}

// Helper function to calculate pagination result
function calculatePaginationResult(results: Thread[], maxResults: number) {
  const hasNextPage = results.length > maxResults;
  const threadResults = hasNextPage ? results.slice(0, maxResults) : results;
  const nextPageToken = hasNextPage ? results[maxResults].latestReceivedOn : null;

  return { threads: threadResults, nextPageToken };
}

export async function findThreadsWithPagination(
  db: DB,
  params: {
    labelIds?: string[];
    searchText?: string;
    pageToken?: string;
    maxResults: number;
    requireAllLabels?: boolean;
  },
): Promise<{ threads: Thread[]; nextPageToken: string | null }> {
  const { labelIds = [], searchText, pageToken, maxResults, requireAllLabels = false } = params;

  const conditions = [];

  // Apply label filtering
  const labelCondition = buildLabelConditions(db, labelIds, requireAllLabels);
  if (labelCondition) {
    conditions.push(labelCondition);
  }

  // Apply text search
  if (searchText) {
    conditions.push(buildTextSearchConditions(searchText));
  }

  // Apply pagination
  if (pageToken) {
    conditions.push(buildPaginationConditions(pageToken));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select(threadSelect)
    .from(threads)
    .where(whereClause)
    .orderBy(desc(threads.latestReceivedOn))
    .limit(maxResults + 1);

  return calculatePaginationResult(results, maxResults);
}

export async function findThreadsByFolder(db: DB, folderLabel: string): Promise<Thread[]> {
  const results = await db
    .select(threadSelect)
    .from(threads)
    .innerJoin(threadLabels, eq(threads.id, threadLabels.threadId))
    .where(eq(threadLabels.labelId, folderLabel))
    .orderBy(desc(threads.latestReceivedOn));

  return results;
}

export async function findThreadsByFolderWithPagination(
  db: DB,
  folderLabel: string,
  params: {
    pageToken?: string;
    maxResults: number;
    providerId?: string;
    labelIds?: string[];
    senderEmail?: string;
    domain?: string;
  },
): Promise<{ threads: Thread[]; nextPageToken: string | null }> {
  const { pageToken, maxResults, providerId, labelIds, senderEmail, domain } = params;

  const required = [...new Set([folderLabel, ...(labelIds ?? [])])];

  const conditions = [inArray(threadLabels.labelId, required)];

  if (providerId) {
    conditions.push(eq(threads.providerId, providerId));
  }
  if (senderEmail) conditions.push(senderEmailEq(senderEmail));
  if (domain) conditions.push(senderDomainEq(domain));

  if (pageToken) {
    const split = pageToken.lastIndexOf('|');
    const ts = split === -1 ? pageToken : pageToken.slice(0, split);
    const id = split === -1 ? null : pageToken.slice(split + 1);
    conditions.push(
      id === null
        ? lt(threads.latestReceivedOn, ts)
        : or(
            lt(threads.latestReceivedOn, ts),
            and(eq(threads.latestReceivedOn, ts), lt(threads.id, id)),
          )!,
    );
  }

  const results = await db
    .select(threadSelect)
    .from(threads)
    .innerJoin(threadLabels, eq(threads.id, threadLabels.threadId))
    .where(and(...conditions))
    .groupBy(threads.id)
    .having(sql`count(distinct ${threadLabels.labelId}) = ${required.length}`)
    .orderBy(desc(threads.latestReceivedOn), desc(threads.id))
    .limit(maxResults + 1);

  const hasNextPage = results.length > maxResults;
  const threadResults = hasNextPage ? results.slice(0, maxResults) : results;
  const last = threadResults[threadResults.length - 1];
  const nextPageToken =
    hasNextPage && last?.latestReceivedOn ? `${last.latestReceivedOn}|${last.id}` : null;

  return { threads: threadResults, nextPageToken };
}

// --- sender / domain grouping ------------------------------------------------

const senderEmailExpr = sql`lower(json_extract(${threads.latestSender}, '$.email'))`;
const senderDomainExpr = sql`substr(${senderEmailExpr}, instr(${senderEmailExpr}, '@') + 1)`;

function senderEmailEq(email: string) {
  return sql`${senderEmailExpr} = ${email.toLowerCase()}`;
}
function senderDomainEq(domain: string) {
  return sql`${senderDomainExpr} = ${domain.toLowerCase()}`;
}

export async function getFolderThreadSenders(
  db: DB,
  folderLabel: string,
  params: { providerId?: string; labelIds?: string[] },
): Promise<{ id: string; latestSender: Sender | null }[]> {
  const { providerId, labelIds } = params;
  const required = [...new Set([folderLabel, ...(labelIds ?? [])])];

  const conditions = [inArray(threadLabels.labelId, required)];
  if (providerId) conditions.push(eq(threads.providerId, providerId));

  return db
    .select({ id: threads.id, latestSender: threads.latestSender })
    .from(threads)
    .innerJoin(threadLabels, eq(threads.id, threadLabels.threadId))
    .where(and(...conditions))
    .groupBy(threads.id)
    .having(sql`count(distinct ${threadLabels.labelId}) = ${required.length}`);
}


/** What a provider's sync module supplies; providerId/syncedAt/deltaCursor are stamped here. */
export type FolderRow = Omit<InsertFolder, 'providerId' | 'syncedAt' | 'deltaCursor'>;

/**
 * Delete-then-insert, so a folder removed at the provider disappears locally. Rows arrive already
 * flat with `parentId` set — each provider derives nesting its own way (Gmail from '/' in the label
 * name, Graph from childFolders), so there is no shared tree shape to flatten here.
 */
export async function replaceFolders(
  db: DB,
  providerId: string,
  input: FolderRow[],
  now: string,
): Promise<void> {
  const rows: InsertFolder[] = input.map((r) => ({ ...r, providerId, syncedAt: now }));

  // Carry deltaCursor across the replace — a tree refresh must not reset a folder's delta position.
  const existing = await db
    .select({ id: folders.id, deltaCursor: folders.deltaCursor })
    .from(folders)
    .where(eq(folders.providerId, providerId));
  const cursors = new Map(existing.map((f) => [f.id, f.deltaCursor]));
  for (const row of rows) row.deltaCursor = cursors.get(row.id) ?? null;

  const stmts: unknown[] = [db.delete(folders).where(eq(folders.providerId, providerId))];
  if (rows.length > 0) stmts.push(db.insert(folders).values(rows));

  await db.batch(stmts as unknown as Parameters<typeof db.batch>[0]);
}

export async function getFolders(db: DB, providerId: string): Promise<Folder[]> {
  return await db
    .select()
    .from(folders)
    .where(eq(folders.providerId, providerId))
    .orderBy(asc(folders.name));
}

export async function getFolderByRole(
  db: DB,
  providerId: string,
  role: NonNullable<Folder['role']>,
): Promise<Folder | null> {
  const [res] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.providerId, providerId), eq(folders.role, role)));
  return res ?? null;
}

export async function setFolderDeltaCursor(
  db: DB,
  folderId: string,
  cursor: string | null,
): Promise<void> {
  await db.update(folders).set({ deltaCursor: cursor }).where(eq(folders.id, folderId));
}

/**
 * Body-less latest-message rows from a folder listing. onConflictDoNothing so a stub can never
 * overwrite a message already fetched in full.
 */
export async function hydrateMessageStubs(db: DB, msgs: InsertMessage[]): Promise<void> {
  if (msgs.length === 0) return;
  const stmts = msgs.map((m) => db.insert(messages).values(m).onConflictDoNothing());
  await db.batch(stmts as unknown as Parameters<typeof db.batch>[0]);
}

/** Delta tombstones carry only a message id; the thread survives if other messages remain. */
export async function deleteMessagesByIds(db: DB, messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  await db.delete(attachments).where(inArray(attachments.messageId, messageIds));
  await db.delete(messages).where(inArray(messages.id, messageIds));
}

/**
 * Drop a thread's messages that the provider no longer reports. Graph re-ids a message when it moves
 * folders, so without this a trash/archive leaves the pre-move rows behind: the thread shows every
 * message twice, and the stale attachment ids 404 on download.
 */
export async function pruneThreadMessages(
  db: DB,
  threadId: string,
  keepIds: string[],
): Promise<void> {
  const stale = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.threadId, threadId),
        keepIds.length ? notInArray(messages.id, keepIds) : sql`1 = 1`,
      ),
    );
  await deleteMessagesByIds(
    db,
    stale.map((m) => m.id),
  );
}

// --- sync cursors ------------------------------------------------------------

export type SyncScope = typeof syncState.$inferSelect;

export async function getSyncState(db: DB, scope: string): Promise<SyncScope | null> {
  const [res] = await db.select().from(syncState).where(eq(syncState.scope, scope));
  return res ?? null;
}

export async function setSyncState(
  db: DB,
  scope: string,
  providerId: string,
  syncedAt: string,
  cursor?: string | null,
): Promise<void> {
  // Omitting `cursor` leaves the stored one intact; passing null clears it.
  const row = { scope, providerId, syncedAt, ...(cursor !== undefined ? { cursor } : {}) };
  await db
    .insert(syncState)
    .values(row)
    .onConflictDoUpdate({ target: [syncState.scope], set: row });
}

/** Pass no scopes to reset everything. */
export async function clearSyncState(db: DB, scopes?: string[]): Promise<void> {
  if (scopes && scopes.length === 0) return;
  await db.delete(syncState).where(scopes ? inArray(syncState.scope, scopes) : sql`1 = 1`);
}

export async function clearSyncStateByPrefix(db: DB, prefix: string): Promise<void> {
  await db.delete(syncState).where(like(syncState.scope, `${prefix}%`));
}

export async function listSyncStateByPrefix(db: DB, prefix: string): Promise<SyncScope[]> {
  return await db.select().from(syncState).where(like(syncState.scope, `${prefix}%`));
}

// --- outbox: local-first drafts + queued sends -------------------------------

export type OutboxRow = typeof outbox.$inferSelect;
export type InsertOutbox = typeof outbox.$inferInsert;
export type { OutboxKind, OutboxStatus, OutboxPayload, OutboxAttachment } from './schema';

export async function upsertOutbox(db: DB, row: InsertOutbox): Promise<void> {
  await db.insert(outbox).values(row).onConflictDoUpdate({ target: [outbox.id], set: row });
}

export async function updateOutbox(
  db: DB,
  id: string,
  patch: Partial<InsertOutbox>,
): Promise<void> {
  await db
    .update(outbox)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(outbox.id, id));
}

export async function deleteOutbox(db: DB, id: string): Promise<void> {
  await db.delete(outbox).where(eq(outbox.id, id));
}

/** Resolves either identity: the composer holds the local id, the mail list the provider's. */
export async function getOutbox(db: DB, id: string): Promise<OutboxRow | null> {
  const [res] = await db
    .select()
    .from(outbox)
    .where(or(eq(outbox.id, id), eq(outbox.remoteId, id)));
  return res ?? null;
}

/** What the Drafts folder shows: saved drafts, plus sends that gave up and fell back to a draft. */
export async function listOutboxDrafts(
  db: DB,
  providerId: string,
  maxResults: number,
): Promise<OutboxRow[]> {
  return await db
    .select()
    .from(outbox)
    .where(and(eq(outbox.providerId, providerId), inArray(outbox.status, ['draft', 'failed'])))
    .orderBy(desc(outbox.updatedAt))
    .limit(maxResults);
}

/** Queued sends whose undo window (or schedule) has elapsed. */
export async function dueSends(db: DB, now: number): Promise<OutboxRow[]> {
  return await db
    .select()
    .from(outbox)
    .where(
      and(
        eq(outbox.kind, 'send'),
        eq(outbox.status, 'queued'),
        or(sql`${outbox.sendAfter} is null`, lt(outbox.sendAfter, now + 1)),
      ),
    )
    .orderBy(asc(outbox.createdAt));
}

/**
 * Sends left mid-flight by a reload or a crashed tab. `attempts` was already incremented before the
 * provider call, so requeuing them can't loop forever — MAX_SEND_ATTEMPTS still caps it.
 */
export async function stalledSends(db: DB, olderThan: string): Promise<OutboxRow[]> {
  return await db
    .select()
    .from(outbox)
    .where(and(eq(outbox.status, 'sending'), lt(outbox.updatedAt, olderThan)));
}

/** Drafts with local edits the provider hasn't seen, and drafts deleted while offline. */
export async function pendingDraftWrites(db: DB): Promise<OutboxRow[]> {
  return await db
    .select()
    .from(outbox)
    .where(
      or(
        and(eq(outbox.kind, 'draft'), eq(outbox.status, 'draft'), eq(outbox.dirty, true)),
        eq(outbox.status, 'deleting'),
      ),
    )
    .orderBy(asc(outbox.updatedAt));
}

/** Provider draft ids currently represented by a local row — used to skip them on a drafts sync. */
export async function outboxRemoteIds(db: DB): Promise<string[]> {
  const rows = await db
    .select({ remoteId: outbox.remoteId })
    .from(outbox)
    .where(sql`${outbox.remoteId} is not null`);
  return rows.map((r) => r.remoteId).filter((id): id is string => id != null);
}

/**
 * Drop provider-backed drafts that no longer exist upstream (sent or deleted elsewhere). Matched on
 * remoteId, not id — a local draft we pushed keeps its client-generated id. Rows with unpushed local
 * edits are kept regardless: the user's work outranks the provider's view.
 */
export async function pruneRemoteDrafts(
  db: DB,
  providerId: string,
  remoteIds: string[],
): Promise<void> {
  await db
    .delete(outbox)
    .where(
      and(
        eq(outbox.providerId, providerId),
        eq(outbox.kind, 'draft'),
        eq(outbox.dirty, false),
        remoteIds.length ? notInArray(outbox.remoteId, remoteIds) : sql`1 = 1`,
      ),
    );
}
