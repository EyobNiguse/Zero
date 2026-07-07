/**
 * Local (browser) mirror schema — ported 1:1 from the server durable-sqlite
 * schema at apps/server/src/routes/agent/db/schema.ts. Same Drizzle SQLite
 * dialect, so the query functions in ./queries run unchanged against the
 * OPFS-backed WASM database.
 */
import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

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

/** Attachment metadata. Bytes are fetched on demand, not stored here. */
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
  },
  (table) => [
    index('attachments_message_id_idx').on(table.messageId),
    unique().on(table.messageId, table.attachmentId),
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
