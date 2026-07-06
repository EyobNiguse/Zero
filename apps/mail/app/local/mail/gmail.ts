/**
 * Gmail REST driver — browser -> gmail.googleapis.com directly (CORS).
 *
 * NOTE (MVP): thread summaries are built with an N+1 fetch (threads.list, then
 * threads.get metadata per thread). Fine for a first page; batch or use
 * history.list deltas for scale (later step).
 */
import type { TokenProvider } from '../auth/types';
import type { InsertMessage, InsertAttachment } from '../db/queries';
import { base64Url, base64UrlDecode, buildMime } from './mime';
import type {
  MailDriver,
  MailFolder,
  FolderRole,
  SendInput,
  SendResult,
  NormalizedThread,
  ThreadDetail,
  AttachmentBytes,
} from './types';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** Gmail system-label id -> navigable folder role. */
const GMAIL_ROLE: Record<string, FolderRole> = {
  INBOX: 'inbox',
  SENT: 'sent',
  DRAFT: 'drafts',
  TRASH: 'trash',
  SPAM: 'spam',
  STARRED: 'starred',
  IMPORTANT: 'important',
};

interface GmailLabel {
  id: string;
  name: string;
  type?: 'system' | 'user';
  messagesUnread?: number;
  messagesTotal?: number;
}

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart;
}
interface GmailThread {
  id: string;
  messages?: GmailMessage[];
}

function headerOf(part: GmailPart | undefined, name: string): string | undefined {
  return part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

function header(msg: GmailMessage, name: string): string | undefined {
  return headerOf(msg.payload, name);
}

/** Parse a `From` header like `Jane Doe <jane@x.com>` into a Sender. */
function parseSender(raw?: string): { name?: string; email: string } | null {
  if (!raw) return null;
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || undefined, email: m[2].trim() };
  return { email: raw.trim() };
}

/** Split an address-list header (To/Cc) on top-level commas and parse each. */
function parseSenderList(raw?: string): { name?: string; email: string }[] {
  if (!raw) return [];
  return raw
    .split(/,(?![^<]*>)/)
    .map((p) => parseSender(p))
    .filter((s): s is { name?: string; email: string } => s != null);
}

interface WalkAcc {
  html?: string;
  text?: string;
  attachments: Omit<InsertAttachment, 'messageId'>[];
}

/** Depth-first walk of a Gmail MIME tree: collect bodies + attachment meta. */
function walkParts(part: GmailPart | undefined, acc: WalkAcc): void {
  if (!part) return;
  const mime = part.mimeType ?? '';
  if (mime.startsWith('multipart/')) {
    for (const p of part.parts ?? []) walkParts(p, acc);
    return;
  }

  const filename = part.filename ?? '';
  const attachmentId = part.body?.attachmentId;
  if (filename || attachmentId) {
    const disp = headerOf(part, 'Content-Disposition') ?? '';
    const contentId = headerOf(part, 'Content-ID')?.replace(/[<>]/g, '') ?? null;
    acc.attachments.push({
      attachmentId: attachmentId ?? '',
      filename: filename || null,
      mimeType: mime || null,
      size: part.body?.size ?? null,
      inline: /inline/i.test(disp) || contentId != null,
      contentId,
    });
    return;
  }

  const data = part.body?.data;
  if (!data) return;
  const text = new TextDecoder().decode(base64UrlDecode(data));
  if (mime === 'text/html') acc.html = (acc.html ?? '') + text;
  else if (mime === 'text/plain') acc.text = (acc.text ?? '') + text;
}

export function createGmailDriver(auth: TokenProvider, providerId: string): MailDriver {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await auth.getAccessToken();
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`gmail ${init?.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  function toNormalized(thread: GmailThread): NormalizedThread | null {
    const msgs = thread.messages ?? [];
    if (msgs.length === 0) return null;
    const last = msgs[msgs.length - 1];
    const receivedMs = last.internalDate ? Number(last.internalDate) : undefined;
    // Store received date as ISO text (schema column is text, sorted lexically —
    // ISO 8601 sorts correctly).
    const latestReceivedOn = receivedMs ? new Date(receivedMs).toISOString() : null;
    // Union of label ids across the thread's messages.
    const labelIds = [...new Set(msgs.flatMap((m) => m.labelIds ?? []))];

    return {
      thread: {
        id: thread.id,
        threadId: thread.id,
        providerId,
        latestSender: parseSender(header(last, 'From')),
        latestReceivedOn,
        latestSubject: header(last, 'Subject') ?? null,
      },
      labelIds,
    };
  }

  return {
    providerId,

    async listFolders(): Promise<MailFolder[]> {
      const data = await call<{ labels?: GmailLabel[] }>(`/labels`);
      const labels = data.labels ?? [];
      // Keep user labels + the system labels that read as folders; drop Gmail's
      // internal system labels (CATEGORY_*, CHAT, UNREAD, ...) from the sidebar.
      return labels
        .filter((l) => l.type === 'user' || l.id in GMAIL_ROLE)
        .map((l) => ({
          id: l.id,
          name: l.name,
          role: GMAIL_ROLE[l.id] ?? null,
          unread: l.messagesUnread ?? null,
          total: l.messagesTotal ?? null,
        }));
    },

    async listThreads(opts = {}) {
      const { pageToken, maxResults = 25, labelId } = opts;
      const qs = new URLSearchParams({ maxResults: String(maxResults) });
      if (pageToken) qs.set('pageToken', pageToken);
      if (labelId) qs.set('labelIds', labelId);

      const listed = await call<{
        threads?: { id: string }[];
        nextPageToken?: string;
      }>(`/threads?${qs.toString()}`);

      const ids = (listed.threads ?? []).map((t) => t.id);
      const full = await Promise.all(
        ids.map((id) =>
          call<GmailThread>(
            `/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          ),
        ),
      );

      const threads = full.map(toNormalized).filter((t): t is NormalizedThread => t != null);
      return { threads, nextPageToken: listed.nextPageToken ?? null };
    },

    async getThread(threadId: string): Promise<ThreadDetail> {
      const full = await call<GmailThread>(`/threads/${threadId}?format=full`);
      const messages: InsertMessage[] = [];
      const attachments: InsertAttachment[] = [];

      for (const msg of full.messages ?? []) {
        const acc: WalkAcc = { attachments: [] };
        walkParts(msg.payload, acc);

        const receivedMs = msg.internalDate ? Number(msg.internalDate) : undefined;
        messages.push({
          id: msg.id,
          threadId: msg.threadId,
          providerId,
          sender: parseSender(header(msg, 'From')),
          toRecipients: parseSenderList(header(msg, 'To')),
          ccRecipients: parseSenderList(header(msg, 'Cc')),
          subject: header(msg, 'Subject') ?? null,
          snippet: msg.snippet ?? null,
          bodyHtml: acc.html ?? null,
          bodyText: acc.text ?? null,
          receivedOn: receivedMs ? new Date(receivedMs).toISOString() : null,
          hasAttachments: acc.attachments.length > 0,
        });
        for (const a of acc.attachments) attachments.push({ ...a, messageId: msg.id });
      }

      return { messages, attachments };
    },

    async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentBytes> {
      const res = await call<{ data: string; size: number }>(
        `/messages/${messageId}/attachments/${attachmentId}`,
      );
      // filename / mimeType come from the stored metadata, not this endpoint.
      return { filename: null, mimeType: null, bytes: base64UrlDecode(res.data) };
    },

    async sendMessage(input: SendInput): Promise<SendResult> {
      const mime = buildMime(input, auth.getEmail() ?? undefined);
      const body = JSON.stringify({
        raw: base64Url(mime),
        ...(input.threadId ? { threadId: input.threadId } : {}),
      });
      const res = await call<{ id: string; threadId: string }>(`/messages/send`, {
        method: 'POST',
        body,
      });
      return { id: res.id, threadId: res.threadId };
    },

    async modifyLabels(threadId, addLabelIds, removeLabelIds) {
      await call(`/threads/${threadId}/modify`, {
        method: 'POST',
        body: JSON.stringify({ addLabelIds, removeLabelIds }),
      });
    },
  };
}
