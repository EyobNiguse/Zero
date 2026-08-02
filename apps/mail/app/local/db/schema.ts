/**
 * Local (browser) mirror schema — ported 1:1 from the server durable-sqlite
 * schema at apps/server/src/routes/agent/db/schema.ts. Same Drizzle SQLite
 * dialect, so the query functions in ./queries run unchanged against the
 * OPFS-backed WASM database.
 */
import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
// Type-only, so the schema <-> mail/types cycle is erased at build time.
import type { FolderRole } from '../mail/types';


export interface Sender {
  name?: string;
  email: string;
}

export const threads = sqliteTable(
  'threads',
  {
    id: text('id').notNull().primaryKey(),
    threadId: text('thread_id').notNull(),
    providerId: text('provider_id').notNull(),
    latestSender: text('latest_sender', { mode: 'json' }).$type<Sender>(),
    latestReceivedOn: text('latest_received_on'),
    latestSubject: text('latest_subject'),
    /** Messages in the conversation. Null where the provider's list can't say (Graph). */
    replyCount: integer('reply_count'),
  },
  (table) => [
    index('threads_thread_id_idx').on(table.threadId),
    index('threads_provider_id_idx').on(table.providerId),
    index('threads_latest_received_on_idx').on(table.latestReceivedOn),
    index('threads_latest_subject_idx').on(table.latestSubject),
    index('threads_latest_sender_idx').on(table.latestSender),
  ],
);

export const labels = sqliteTable(
  'labels',
  {
    id: text('id').notNull().primaryKey(),
    name: text('name').notNull(),
    color: text('color').notNull(),
  },
  (table) => [index('labels_name_idx').on(table.name)],
);

export const folders = sqliteTable(
  'folders',
  {
    id: text('id').notNull().primaryKey(),
    providerId: text('provider_id').notNull(),
    name: text('name').notNull(),
    role: text('role').$type<FolderRole>(),
    parentId: text('parent_id'),
    unread: integer('unread'),
    total: integer('total'),
    /** Graph per-folder @odata.deltaLink. Gmail's cursor is mailbox-wide — see syncState. */
    deltaCursor: text('delta_cursor'),
    syncedAt: text('synced_at'),
  },
  (table) => [
    index('folders_provider_id_idx').on(table.providerId),
    index('folders_role_idx').on(table.role),
    index('folders_parent_id_idx').on(table.parentId),
  ],
);

export const syncState = sqliteTable('sync_state', {
  scope: text('scope').notNull().primaryKey(),
  providerId: text('provider_id').notNull(),
  cursor: text('cursor'),
  syncedAt: text('synced_at'),
});

export const threadLabels = sqliteTable(
  'thread_labels',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('thread_labels_thread_id_idx').on(table.threadId),
    index('thread_labels_label_id_idx').on(table.labelId),
    index('thread_labels_thread_label_idx').on(table.threadId, table.labelId),
    unique().on(table.threadId, table.labelId),
  ],
);

/** A single message inside a thread, with its rendered bodies. */
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').notNull().primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    sender: text('sender', { mode: 'json' }).$type<Sender>(),
    toRecipients: text('to_recipients', { mode: 'json' }).$type<Sender[]>(),
    ccRecipients: text('cc_recipients', { mode: 'json' }).$type<Sender[]>(),
    subject: text('subject'),
    snippet: text('snippet'),
    bodyHtml: text('body_html'),
    bodyText: text('body_text'),
    receivedOn: text('received_on'),
    hasAttachments: integer('has_attachments', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
    index('messages_thread_id_idx').on(table.threadId),
    index('messages_received_on_idx').on(table.receivedOn),
  ],
);

/** Attachment metadata, plus the bytes once they've been fetched at least once. */
export const attachments = sqliteTable(
  'attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    /** Provider attachment id used to fetch the bytes later. */
    attachmentId: text('attachment_id').notNull(),
    filename: text('filename'),
    mimeType: text('mime_type'),
    size: integer('size'),
    inline: integer('inline', { mode: 'boolean' }).notNull().default(false),
    /** Content-ID for inline (cid:) images. */
    contentId: text('content_id'),
    /**
     * Base64 bytes, cached on first fetch so the attachment opens offline. Base64 rather than a
     * BLOB because that is the shape the UI renders (data: URLs). Null until fetched, and stays
     * null for attachments over the cache ceiling — see resolvers' ATTACHMENT_CACHE_MAX_BYTES.
     */
    body: text('body'),
  },
  (table) => [
    index('attachments_message_id_idx').on(table.messageId),
    unique().on(table.messageId, table.attachmentId),
  ],
);

export type OutboxKind = 'draft' | 'send';
/** `deleting` is a draft the user dropped while the provider copy still exists. */
export type OutboxStatus = 'draft' | 'queued' | 'sending' | 'failed' | 'deleting';

export interface OutboxAttachment {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

export interface OutboxPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  fromEmail?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: OutboxAttachment[];
}

/**
 * Durable queue for everything the user writes — drafts and pending sends. The resolvers write here
 * synchronously and return, so composing and sending work offline; ./rpc/outbox drains it against
 * the provider in the background.
 */
export const outbox = sqliteTable(
  'outbox',
  {
    /** Client-generated and stable across a provider push, so the composer's ?draftId keeps resolving. */
    id: text('id').notNull().primaryKey(),
    providerId: text('provider_id').notNull(),
    kind: text('kind').$type<OutboxKind>().notNull(),
    status: text('status').$type<OutboxStatus>().notNull(),
    /** Provider draft id: set once pushed, or on a draft mirrored down from the provider. */
    remoteId: text('remote_id'),
    /** The thread a reply belongs to, if any. */
    threadId: text('thread_id'),
    payload: text('payload', { mode: 'json' }).$type<OutboxPayload>().notNull(),
    /** Local edits the provider hasn't seen. Drafts pulled from the provider start clean. */
    dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    /** Epoch ms. The undo-send window on a queued send, or the time the user scheduled it for. */
    sendAfter: integer('send_after'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('outbox_status_idx').on(table.status),
    index('outbox_provider_id_idx').on(table.providerId),
    index('outbox_updated_at_idx').on(table.updatedAt),
  ],
);

export const threadsRelations = relations(threads, ({ many }) => ({
  threadLabels: many(threadLabels),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  thread: one(threads, { fields: [messages.threadId], references: [threads.id] }),
  attachments: many(attachments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  message: one(messages, { fields: [attachments.messageId], references: [messages.id] }),
}));

export const labelsRelations = relations(labels, ({ many }) => ({
  threadLabels: many(threadLabels),
}));

export const threadLabelsRelations = relations(threadLabels, ({ one }) => ({
  thread: one(threads, {
    fields: [threadLabels.threadId],
    references: [threads.id],
  }),
  label: one(labels, {
    fields: [threadLabels.labelId],
    references: [labels.id],
  }),
}));
