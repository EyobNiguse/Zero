/**
 * Gmail REST driver — browser -> gmail.googleapis.com directly (CORS).
 * NOTE: thread summaries use an N+1 fetch (fine for a first page; batch later).
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
  DraftInput,
  ParsedDraftResult,
  DraftList,
  MailLabel,
  LabelColor,
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
    // DELETE (drafts) and other 204s return no body.
    if (res.status === 204) return null as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  function toNormalized(thread: GmailThread): NormalizedThread | null {
    const msgs = thread.messages ?? [];
    if (msgs.length === 0) return null;
    const last = msgs[msgs.length - 1];
    const receivedMs = last.internalDate ? Number(last.internalDate) : undefined;
    // Store received date as ISO text (sorts lexically).
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
      // Keep user labels + folder-like system labels; drop internal ones (CATEGORY_*, CHAT, UNREAD).
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
      const { pageToken, maxResults = 25, labelId, q } = opts;
      const qs = new URLSearchParams({ maxResults: String(maxResults) });
      if (pageToken) qs.set('pageToken', pageToken);
      // Search query takes precedence; otherwise scope by label id.
      if (q) qs.set('q', q);
      else if (labelId) qs.set('labelIds', labelId);

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

    async trashThread(threadId) {
      // Gmail has a first-class trash endpoint (moves every message + adds TRASH).
      await call(`/threads/${threadId}/trash`, { method: 'POST' });
    },

    async createDraft(input: DraftInput): Promise<{ id: string }> {
      const mime = buildMime(
        { to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject, text: '', html: input.html },
        auth.getEmail() ?? undefined,
      );
      const body = JSON.stringify({ message: { raw: base64Url(mime) } });
      // id present => replace the existing draft in place (PUT), else create.
      const res = input.id
        ? await call<{ id: string }>(`/drafts/${input.id}`, { method: 'PUT', body })
        : await call<{ id: string }>(`/drafts`, { method: 'POST', body });
      return { id: res.id };
    },

    async getDraft(id: string): Promise<ParsedDraftResult> {
      const draft = await call<{ id: string; message?: GmailMessage }>(`/drafts/${id}?format=full`);
      const msg = draft.message;
      const acc: WalkAcc = { attachments: [] };
      if (msg) walkParts(msg.payload, acc);
      const emails = (raw?: string) => parseSenderList(raw).map((s) => s.email);
      return {
        id: draft.id,
        to: emails(msg && header(msg, 'To')),
        cc: emails(msg && header(msg, 'Cc')),
        bcc: emails(msg && header(msg, 'Bcc')),
        subject: (msg && header(msg, 'Subject')) ?? '',
        content: acc.html ?? acc.text ?? '',
      };
    },

    async listDrafts(opts = {}): Promise<DraftList> {
      const { maxResults = 25, pageToken } = opts;
      const qs = new URLSearchParams({ maxResults: String(maxResults) });
      if (pageToken) qs.set('pageToken', pageToken);
      const data = await call<{
        drafts?: { id: string; message?: { id: string; threadId: string } }[];
        nextPageToken?: string;
      }>(`/drafts?${qs.toString()}`);
      return {
        threads: (data.drafts ?? []).map((d) => ({ id: d.id, historyId: null, $raw: d })),
        nextPageToken: data.nextPageToken ?? null,
      };
    },

    async deleteDraft(id: string): Promise<void> {
      await call(`/drafts/${id}`, { method: 'DELETE' });
    },

    async getEmailAliases() {
      // Gmail exposes configured send-as identities under settings.sendAs.
      const data = await call<{
        sendAs?: { sendAsEmail: string; displayName?: string; isPrimary?: boolean }[];
      }>(`/settings/sendAs`);
      const aliases = (data.sendAs ?? []).map((s) => ({
        email: s.sendAsEmail,
        name: s.displayName ?? '',
        primary: !!s.isPrimary,
      }));
      return aliases.length ? aliases : [{ email: auth.getEmail() ?? '', name: '', primary: true }];
    },

    async createLabel(input: { name: string; color?: LabelColor }): Promise<MailLabel> {
      // Gmail only accepts palette colors; pass through only when both hex values are set.
      const color =
        input.color?.backgroundColor && input.color?.textColor ? input.color : undefined;
      const res = await call<{ id: string; name: string }>(`/labels`, {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
          ...(color ? { color } : {}),
        }),
      });
      return { id: res.id, name: res.name, color, type: 'user' };
    },

    async updateLabel(id: string, input: { name: string; color?: LabelColor }): Promise<MailLabel> {
      const color =
        input.color?.backgroundColor && input.color?.textColor ? input.color : undefined;
      const res = await call<{ id: string; name: string }>(`/labels/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: input.name, ...(color ? { color } : {}) }),
      });
      return { id: res.id, name: res.name, color, type: 'user' };
    },

    async deleteLabel(id: string): Promise<void> {
      await call(`/labels/${id}`, { method: 'DELETE' });
    },
  };
}
