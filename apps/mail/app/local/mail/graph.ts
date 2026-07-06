/**
 * Microsoft Graph driver — browser -> graph.microsoft.com directly (CORS).
 *
 * MAPPING CAVEATS (Graph has no Gmail-equivalent model):
 *  - "thread"  -> Graph `conversationId` (messages grouped by conversation).
 *  - "labels"  -> Graph `categories`. Gmail system labels (INBOX/SPAM/...) have
 *    no direct Graph analog; folder moves (isRead, Archive) are a later concern.
 *  - sendMail returns 202 with no body, so SendResult has no server id yet.
 */
import type { TokenProvider } from '../auth/types';
import type { InsertMessage, InsertAttachment } from '../db/queries';
import { base64Decode } from './mime';
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

const BASE = 'https://graph.microsoft.com/v1.0';

/**
 * Graph well-known folder aliases -> navigable folder role. Each alias is
 * addressable directly (GET /me/mailFolders/{alias}); the folder's real id and
 * localized displayName come back in the response. (wellKnownName is not a
 * $select-able property on mailFolder in v1.0, so we don't enumerate + guess.)
 */
const WELL_KNOWN: { alias: string; role: FolderRole }[] = [
  { alias: 'inbox', role: 'inbox' },
  { alias: 'archive', role: 'archive' },
  { alias: 'sentitems', role: 'sent' },
  { alias: 'drafts', role: 'drafts' },
  { alias: 'junkemail', role: 'spam' },
  { alias: 'deleteditems', role: 'trash' },
];

interface GraphFolder {
  id: string;
  displayName?: string;
  unreadItemCount?: number;
  totalItemCount?: number;
}

interface GraphRecipient {
  emailAddress?: { name?: string; address?: string };
}
interface GraphMessage {
  id: string;
  conversationId: string;
  subject?: string;
  from?: GraphRecipient;
  receivedDateTime?: string;
  categories?: string[];
  parentFolderId?: string;
}
interface GraphFullMessage extends GraphMessage {
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  body?: { contentType?: string; content?: string };
  bodyPreview?: string;
  hasAttachments?: boolean;
}
interface GraphAttachment {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentId?: string;
  contentBytes?: string;
}

function mapRecipient(r?: GraphRecipient): { name?: string; email: string } | null {
  const a = r?.emailAddress;
  return a?.address ? { name: a.name, email: a.address } : null;
}
function mapRecipients(list?: GraphRecipient[]): { name?: string; email: string }[] {
  return (list ?? []).map(mapRecipient).filter((s): s is { name?: string; email: string } => s != null);
}

export function createGraphDriver(auth: TokenProvider, providerId: string): MailDriver {
  async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
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
      throw new Error(`graph ${init?.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`);
    }
    // 202/204 (e.g. sendMail) have no body.
    if (res.status === 202 || res.status === 204) return null;
    return (await res.json()) as T;
  }

  function toNormalized(msg: GraphMessage): NormalizedThread {
    const addr = msg.from?.emailAddress;
    // Folder membership (parentFolderId) is the primary "label"; a message lives
    // in exactly one Graph folder. categories are extra multi-value labels.
    const labelIds = [...(msg.parentFolderId ? [msg.parentFolderId] : []), ...(msg.categories ?? [])];
    return {
      thread: {
        id: msg.conversationId,
        threadId: msg.conversationId,
        providerId,
        latestSender: addr?.address ? { name: addr.name, email: addr.address } : null,
        latestReceivedOn: msg.receivedDateTime ?? null,
        latestSubject: msg.subject ?? null,
      },
      labelIds,
    };
  }

  return {
    providerId,

    async listFolders(): Promise<MailFolder[]> {
      // Fetch each well-known folder by alias, in parallel. A missing folder
      // (e.g. archive on some accounts) 404s — tolerate and skip it. User-
      // created folders are a later concern.
      const select = 'id,displayName,unreadItemCount,totalItemCount';
      const results = await Promise.all(
        WELL_KNOWN.map(async ({ alias, role }) => {
          try {
            const f = await call<GraphFolder>(`/me/mailFolders/${alias}?$select=${select}`);
            if (!f) return null;
            return {
              id: f.id,
              name: f.displayName ?? alias,
              role,
              unread: f.unreadItemCount ?? null,
              total: f.totalItemCount ?? null,
            } as MailFolder;
          } catch {
            return null;
          }
        }),
      );
      return results.filter((f): f is MailFolder => f != null);
    },

    async listThreads(opts = {}) {
      const { maxResults = 25, labelId, pageToken } = opts;
      // pageToken, when present, is a full Graph @odata.nextLink — use it verbatim.
      let path: string;
      if (pageToken) {
        path = pageToken.replace(BASE, '');
      } else {
        const folder = labelId ? `/mailFolders/${labelId}` : '';
        const qs = new URLSearchParams({
          $top: String(maxResults),
          $orderby: 'receivedDateTime desc',
          $select: 'id,conversationId,subject,from,receivedDateTime,categories,parentFolderId',
        });
        path = `/me${folder}/messages?${qs.toString()}`;
      }

      const data = await call<{ value: GraphMessage[]; '@odata.nextLink'?: string }>(path);
      const messages = data?.value ?? [];

      // Messages arrive newest-first; keep the first (latest) per conversation.
      const seen = new Set<string>();
      const threads: NormalizedThread[] = [];
      for (const m of messages) {
        if (seen.has(m.conversationId)) continue;
        seen.add(m.conversationId);
        threads.push(toNormalized(m));
      }

      return { threads, nextPageToken: data?.['@odata.nextLink'] ?? null };
    },

    async getThread(threadId: string): Promise<ThreadDetail> {
      const filter = encodeURIComponent(`conversationId eq '${threadId}'`);
      const select =
        'id,conversationId,subject,from,toRecipients,ccRecipients,body,bodyPreview,receivedDateTime,hasAttachments';
      const data = await call<{ value: GraphFullMessage[] }>(
        `/me/messages?$filter=${filter}&$select=${select}`,
      );
      // Graph rejects $orderby alongside this $filter, so sort client-side.
      const msgs = (data?.value ?? []).sort((a, b) =>
        (a.receivedDateTime ?? '').localeCompare(b.receivedDateTime ?? ''),
      );

      const messages: InsertMessage[] = [];
      const attachments: InsertAttachment[] = [];

      for (const m of msgs) {
        const isHtml = (m.body?.contentType ?? '').toLowerCase() === 'html';
        messages.push({
          id: m.id,
          threadId: m.conversationId,
          providerId,
          sender: mapRecipient(m.from),
          toRecipients: mapRecipients(m.toRecipients),
          ccRecipients: mapRecipients(m.ccRecipients),
          subject: m.subject ?? null,
          snippet: m.bodyPreview ?? null,
          bodyHtml: isHtml ? (m.body?.content ?? null) : null,
          bodyText: isHtml ? null : (m.body?.content ?? null),
          receivedOn: m.receivedDateTime ?? null,
          hasAttachments: !!m.hasAttachments,
        });

        if (m.hasAttachments) {
          const att = await call<{ value: GraphAttachment[] }>(
            `/me/messages/${m.id}/attachments?$select=id,name,contentType,size,isInline,contentId`,
          );
          for (const a of att?.value ?? []) {
            attachments.push({
              messageId: m.id,
              attachmentId: a.id,
              filename: a.name ?? null,
              mimeType: a.contentType ?? null,
              size: a.size ?? null,
              inline: !!a.isInline,
              contentId: a.contentId ?? null,
            });
          }
        }
      }

      return { messages, attachments };
    },

    async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentBytes> {
      const a = await call<GraphAttachment>(`/me/messages/${messageId}/attachments/${attachmentId}`);
      return {
        filename: a?.name ?? null,
        mimeType: a?.contentType ?? null,
        bytes: a?.contentBytes ? base64Decode(a.contentBytes) : new Uint8Array(),
      };
    },

    async sendMessage(input: SendInput): Promise<SendResult> {
      const fileAttachments = (input.attachments ?? []).map((a) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.filename,
        contentType: a.mimeType,
        contentBytes: a.contentBase64,
      }));
      const message = {
        subject: input.subject,
        body: { contentType: input.html ? 'HTML' : 'Text', content: input.html ?? input.text },
        toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
        ...(input.cc?.length
          ? { ccRecipients: input.cc.map((address) => ({ emailAddress: { address } })) }
          : {}),
        ...(input.bcc?.length
          ? { bccRecipients: input.bcc.map((address) => ({ emailAddress: { address } })) }
          : {}),
        ...(fileAttachments.length ? { attachments: fileAttachments } : {}),
      };
      await call(`/me/sendMail`, {
        method: 'POST',
        body: JSON.stringify({ message, saveToSentItems: true }),
      });
      // Graph sendMail yields no id; the sync pass will reconcile the real ids.
      return { id: '', threadId: input.threadId ?? '' };
    },

    async modifyLabels(threadId, addLabelIds, removeLabelIds) {
      // Apply category changes to every message in the conversation.
      const data = await call<{ value: { id: string; categories?: string[] }[] }>(
        `/me/messages?$filter=conversationId eq '${threadId}'&$select=id,categories`,
      );
      for (const msg of data?.value ?? []) {
        const next = new Set(msg.categories ?? []);
        addLabelIds.forEach((l) => next.add(l));
        removeLabelIds.forEach((l) => next.delete(l));
        await call(`/me/messages/${msg.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ categories: [...next] }),
        });
      }
    },
  };
}
