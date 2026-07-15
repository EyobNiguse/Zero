/** Provider-agnostic mail driver: translates a provider's HTTP API into the local db's shape. */
import type { InsertThread, InsertMessage, InsertAttachment } from '../db/queries';

/** A thread summary plus its label ids, ready for db.create(). */
export interface NormalizedThread {
  thread: InsertThread;
  labelIds: string[];
  /**
   * The thread's newest message, without a body. Lets the list render a row from the mirror
   * instead of fetching the whole thread; the real messages land when the thread is opened.
   */
  latestMessage?: InsertMessage;
}

/** A navigable mail folder/label (Gmail label or Graph mailFolder). */
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
  /** Nested child folders (Graph childFolders); empty/undefined for a leaf. */
  children?: MailFolder[];
}

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

/** A user label/category, matching the labels router's output shape. */
export interface MailLabel {
  id: string;
  name: string;
  color?: LabelColor;
  type: string;
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
    /** Provider search query (Gmail `q`, e.g. 'in:archive'); overrides labelId. */
    q?: string;
  }): Promise<ThreadPage>;

  /** Full contents of one thread: messages + bodies + attachment metadata. */
  getThread(threadId: string): Promise<ThreadDetail>;

  /**
   * Changes since `cursor`. Absent on providers with no delta API.
   *
   * `folderId: null` means the whole mailbox — Gmail's history is mailbox-wide, so one read covers
   * every label. Graph's delta only exists per folder, so it requires an id.
   */
  listChanges?(folderId: string | null, cursor: string | null): Promise<FolderChanges>;

  /**
   * Several folders' changes in one round trip, keyed by folder id. Only worth implementing where
   * delta is per-folder and the API can batch (Graph), since keeping N folders fresh would otherwise
   * cost N requests per poll. Callers fall back to looping `listChanges` when this is absent.
   */
  listChangesMany?(
    scopes: { folderId: string; cursor: string | null }[],
  ): Promise<Record<string, FolderChanges>>;

  /** Raw bytes for one attachment, fetched on demand. */
  getAttachment(messageId: string, attachmentId: string): Promise<AttachmentBytes>;

  sendMessage(input: SendInput): Promise<SendResult>;

  modifyLabels(threadId: string, addLabelIds: string[], removeLabelIds: string[]): Promise<void>;

  /** Move a whole thread/conversation to the provider's trash (Deleted Items / TRASH). */
  trashThread(threadId: string): Promise<void>;

  /** Create a draft, or replace it in place when input.id is set. */
  createDraft(input: DraftInput): Promise<{ id: string }>;
  getDraft(id: string): Promise<ParsedDraftResult>;
  listDrafts(opts?: { maxResults?: number; pageToken?: string }): Promise<DraftList>;
  deleteDraft(id: string): Promise<void>;

  /** Send-as identities for the account (primary + configured aliases). */
  getEmailAliases(): Promise<{ email: string; name: string; primary?: boolean }[]>;

  createLabel(input: { name: string; color?: LabelColor }): Promise<MailLabel>;
  updateLabel(id: string, input: { name: string; color?: LabelColor }): Promise<MailLabel>;
  deleteLabel(id: string): Promise<void>;
}
