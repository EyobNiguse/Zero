/**
 * Gmail driver — maps Gmail's wire shapes onto the local db's row types.
 * Transport (auth, batching, URLs, response parsing) lives in ./gmail-client.
 */
import type { TokenProvider } from '../auth/types';
import type { InsertMessage, InsertAttachment } from '../db/queries';
import { base64Url, base64UrlDecode, buildMime } from './mime';
import { createGmailClient, GmailError } from './gmail-client';
import type { GmailMessage, GmailPart, GmailThread, GmailHistoryPage } from './gmail-client';
import type {
  MailDriver,
  SendInput,
  SendResult,
  NormalizedThread,
  FolderChanges,
  ThreadDetail,
  AttachmentBytes,
  DraftInput,
  ParsedDraftResult,
  DraftList,
  MailLabel,
  LabelColor,
} from './types';

/** Gmail only accepts palette colors, so a half-specified one is dropped rather than sent. */
function paletteColor(color?: LabelColor): LabelColor | undefined {
  return color?.backgroundColor && color?.textColor ? color : undefined;
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
  const client = createGmailClient(auth);

  function toNormalized(thread: GmailThread): NormalizedThread | null {
    const msgs = thread.messages ?? [];
    if (msgs.length === 0) return null;
    const last = msgs[msgs.length - 1];
    const receivedMs = last.internalDate ? Number(last.internalDate) : undefined;
    // Store received date as ISO text (sorts lexically).
    const latestReceivedOn = receivedMs ? new Date(receivedMs).toISOString() : null;
    // Union of label ids across the thread's messages.
    const labelIds = [...new Set(msgs.flatMap((m) => m.labelIds ?? []))];
    const sender = parseSender(header(last, 'From'));
    const subject = header(last, 'Subject') ?? null;

    return {
      thread: {
        id: thread.id,
        threadId: thread.id,
        providerId,
        latestSender: sender,
        latestReceivedOn,
        latestSubject: subject,
        replyCount: msgs.length,
      },
      labelIds,
      latestMessage: {
        id: last.id,
        threadId: thread.id,
        providerId,
        sender,
        toRecipients: [],
        ccRecipients: [],
        subject,
        snippet: last.snippet ?? null,
        bodyHtml: null,
        bodyText: null,
        receivedOn: latestReceivedOn,
        hasAttachments: false,
      },
    };
  }

  /** History reports message events; the mirror stores thread state, so fan them in by thread id. */
  function touchedThreadIds(page: GmailHistoryPage): { threadIds: string[]; removed: string[] } {
    const touched = new Set<string>();
    const removed: string[] = [];
    for (const h of page.history ?? []) {
      for (const m of h.messagesDeleted ?? []) removed.push(m.message.id);
      for (const group of [h.messagesAdded, h.labelsAdded, h.labelsRemoved]) {
        for (const m of group ?? []) touched.add(m.message.threadId);
      }
    }
    return { threadIds: [...touched], removed };
  }

  return {
    providerId,

    async listThreads(opts = {}) {
      const { ids, nextPageToken } = await client.listThreadIds(opts);
      const threads = (await client.getThreadsMetadata(ids))
        .map(toNormalized)
        .filter((t): t is NormalizedThread => t != null);
      return { threads, nextPageToken };
    },

    async listChanges(folderId: string | null, cursor: string | null): Promise<FolderChanges> {
      const empty = { threads: [], removedMessageIds: [] };

      if (!cursor) {
        const profile = await client.getProfile();
        return { ...empty, cursor: profile.historyId ?? null, resyncRequired: false };
      }

      let data: GmailHistoryPage;
      try {
        data = await client.listHistory(cursor, folderId ?? undefined);
      } catch (err) {
        // Gmail keeps history for ~a week; past that startHistoryId 404s.
        if (err instanceof GmailError && err.status === 404) {
          return { ...empty, cursor: null, resyncRequired: true };
        }
        throw err;
      }

      const { threadIds, removed } = touchedThreadIds(data);
      const threads = (await client.getThreadsMetadata(threadIds))
        .map(toNormalized)
        .filter((t): t is NormalizedThread => t != null);

      return {
        threads,
        removedMessageIds: removed,
        cursor: data.historyId ?? cursor,
        resyncRequired: false,
      };
    },

    async getThread(threadId: string): Promise<ThreadDetail> {
      const full = await client.getThreadFull(threadId);
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
      const res = await client.getAttachmentRaw(messageId, attachmentId);
      return { filename: null, mimeType: null, bytes: base64UrlDecode(res.data) };
    },

    async sendMessage(input: SendInput): Promise<SendResult> {
      const mime = buildMime(input, auth.getEmail() ?? undefined);
      const res = await client.sendRaw(base64Url(mime), input.threadId);
      return { id: res.id, threadId: res.threadId };
    },

    modifyLabels(threadId, addLabelIds, removeLabelIds) {
      return client.modifyThread(threadId, addLabelIds, removeLabelIds);
    },

    trashThread(threadId) {
      return client.trashThread(threadId);
    },

    async createDraft(input: DraftInput): Promise<{ id: string }> {
      const mime = buildMime(
        { to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject, text: '', html: input.html },
        auth.getEmail() ?? undefined,
      );
      return client.putDraft(base64Url(mime), input.id);
    },

    async getDraft(id: string): Promise<ParsedDraftResult> {
      const draft = await client.getDraftRaw(id);
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
      const { drafts, nextPageToken } = await client.listDraftsRaw(opts);
      return {
        threads: drafts.map((d) => ({ id: d.id, historyId: null, $raw: d })),
        nextPageToken,
      };
    },

    deleteDraft(id: string): Promise<void> {
      return client.deleteDraft(id);
    },

    async getEmailAliases() {
      const aliases = (await client.listSendAs()).map((s) => ({
        email: s.sendAsEmail,
        name: s.displayName ?? '',
        primary: !!s.isPrimary,
      }));
      return aliases.length ? aliases : [{ email: auth.getEmail() ?? '', name: '', primary: true }];
    },

    async createLabel(input: { name: string; color?: LabelColor }): Promise<MailLabel> {
      const color = paletteColor(input.color);
      const res = await client.createLabelRaw({ name: input.name, color });
      return { id: res.id, name: res.name, color, type: 'user' };
    },

    async updateLabel(id: string, input: { name: string; color?: LabelColor }): Promise<MailLabel> {
      const color = paletteColor(input.color);
      const res = await client.updateLabelRaw(id, { name: input.name, color });
      return { id: res.id, name: res.name, color, type: 'user' };
    },

    deleteLabel(id: string): Promise<void> {
      return client.deleteLabelRaw(id);
    },
  };
}
