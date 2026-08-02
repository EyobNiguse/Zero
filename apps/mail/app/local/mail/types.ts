/** Provider-agnostic mail driver: translates a provider's HTTP API into the local db's shape. */
import type { InsertThread, InsertMessage, InsertAttachment } from '../db/queries';

/** A thread summary plus its label ids, ready for db.create(). */
export interface NormalizedThread {
  thread: InsertThread;
  labelIds: string[];
  latestMessage?: InsertMessage;
}

/** A well-known role for a navigable mail folder/label (Gmail label or Graph mailFolder). */
export type FolderRole =
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'trash'
  | 'spam'
  | 'archive'
  | 'starred'
  | 'important';

export interface ThreadPage {
  threads: NormalizedThread[];
  nextPageToken: string | null;
}

/** A thread's full contents: messages + bodies + attachment metadata (bytes fetched lazily). */
export interface ThreadDetail {
  messages: InsertMessage[];
  attachments: InsertAttachment[];
}

/** Incremental changes to one folder since `cursor`. */
export interface FolderChanges {
  threads: NormalizedThread[];
  removedMessageIds: string[];
  /** Opaque; hand back verbatim next round. Null when the provider gave none. */
  cursor: string | null;
  /** The cursor aged out — drop it and do a full sync instead. */
  resyncRequired: boolean;
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

/** A draft to create or update. `id` present => update the existing draft. */
export interface DraftInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  id?: string | null;
}

/** A draft read back for the composer. Shape matches the server's ParsedDraft. */
export interface ParsedDraftResult {
  id: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  content?: string;
}

export interface DraftList {
  threads: { id: string; historyId: string | null; $raw?: unknown }[];
  nextPageToken: string | null;
}

export interface LabelColor {
  backgroundColor: string;
  textColor: string;
}

export interface MailLabel {
  id: string;
  name: string;
  color?: LabelColor;
  type: string;
}

export interface MailDriver {
  readonly providerId: string;

  listThreads(opts?: {
    pageToken?: string;
    maxResults?: number;
    labelId?: string;
    q?: string;
  }): Promise<ThreadPage>;

  getThread(threadId: string): Promise<ThreadDetail>;


  listChanges?(folderId: string | null, cursor: string | null): Promise<FolderChanges>;

 
  listChangesMany?(
    folders: { folderId: string; cursor: string | null }[],
  ): Promise<Record<string, FolderChanges>>;

  getAttachment(messageId: string, attachmentId: string): Promise<AttachmentBytes>;

  sendMessage(input: SendInput): Promise<SendResult>;

  modifyLabels(threadId: string, addLabelIds: string[], removeLabelIds: string[]): Promise<void>;

  trashThread(threadId: string): Promise<void>;

  createDraft(input: DraftInput): Promise<{ id: string }>;
  getDraft(id: string): Promise<ParsedDraftResult>;
  listDrafts(opts?: { maxResults?: number; pageToken?: string }): Promise<DraftList>;
  deleteDraft(id: string): Promise<void>;

  getEmailAliases(): Promise<{ email: string; name: string; primary?: boolean }[]>;

  createLabel(input: { name: string; color?: LabelColor }): Promise<MailLabel>;
  updateLabel(id: string, input: { name: string; color?: LabelColor }): Promise<MailLabel>;
  deleteLabel(id: string): Promise<void>;
}
