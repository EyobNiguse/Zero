/**
 * Provider-agnostic mail driver.
 *
 * Drivers translate a provider's HTTP API into the local database's shape:
 * `listThreads` yields rows ready to hand straight to db `create(...)`, so the
 * hydrate step is a thin loop. All calls go browser -> provider directly
 * (CORS); there is no server in this path.
 */
import type { InsertThread, InsertMessage, InsertAttachment } from '../db/queries';

/** A thread summary plus its label ids, ready for db.create(). */
export interface NormalizedThread {
  thread: InsertThread;
  labelIds: string[];
}

/**
 * A navigable mail folder / label. Both providers reduce to the same shape:
 *  - Gmail: a label (system labels like INBOX/SENT act as folders).
 *  - Graph: a mailFolder (Inbox, JunkEmail, DeletedItems, ...).
 * `id` is the provider id to hand to `listThreads({ labelId })`.
 */
export type FolderRole =
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'trash'
  | 'spam'
  | 'archive'
  | 'starred'
  | 'important';

export interface MailFolder {
  id: string;
  name: string;
  /** Mapped well-known role, or null for a plain user folder/label. */
  role: FolderRole | null;
  unread?: number | null;
  total?: number | null;
}

export interface ThreadPage {
  threads: NormalizedThread[];
  nextPageToken: string | null;
}

/**
 * A thread's full contents: every message with rendered bodies, plus the
 * attachment metadata across those messages. Shapes match db insert types so
 * hydrateMessages(...) is a direct hand-off. Attachment bytes are NOT here —
 * fetch them lazily via getAttachment.
 */
export interface ThreadDetail {
  messages: InsertMessage[];
  attachments: InsertAttachment[];
}

/** Raw attachment bytes, fetched on demand for download / inline render. */
export interface AttachmentBytes {
  filename: string | null;
  mimeType: string | null;
  bytes: Uint8Array;
}

/** An outbound attachment: raw bytes as standard base64 (not base64url). */
export interface SendAttachment {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

export interface SendInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  /** Reply threading. */
  inReplyTo?: string;
  references?: string;
  /** Provider thread id to attach the reply to. */
  threadId?: string;
  attachments?: SendAttachment[];
}

export interface SendResult {
  id: string;
  threadId: string;
}

export interface MailDriver {
  readonly providerId: string;

  /** Enumerate the account's folders / labels for the navigation sidebar. */
  listFolders(): Promise<MailFolder[]>;

  listThreads(opts?: {
    pageToken?: string;
    maxResults?: number;
    /** Provider label/folder id to scope to (e.g. Gmail 'INBOX'). */
    labelId?: string;
  }): Promise<ThreadPage>;

  /** Full contents of one thread: messages + bodies + attachment metadata. */
  getThread(threadId: string): Promise<ThreadDetail>;

  /** Raw bytes for one attachment, fetched on demand. */
  getAttachment(messageId: string, attachmentId: string): Promise<AttachmentBytes>;

  sendMessage(input: SendInput): Promise<SendResult>;

  modifyLabels(threadId: string, addLabelIds: string[], removeLabelIds: string[]): Promise<void>;
}
