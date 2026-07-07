/**
 * Microsoft Graph driver — browser -> graph.microsoft.com directly (CORS).
 * Mapping: thread -> conversationId; labels -> categories; sendMail returns 202 (no id).
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
  DraftInput,
  ParsedDraftResult,
  DraftList,
  MailLabel,
  LabelColor,
} from './types';

const BASE = 'https://graph.microsoft.com/v1.0';

/** Graph well-known folder aliases -> navigable folder role (each alias is directly addressable). */
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
    // parentFolderId is the primary "label"; categories are extra multi-value labels.
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

  /** Resolve a master category's GUID from its displayName (our label id). */
  async function categoryGuid(displayName: string): Promise<string | null> {
    const data = await call<{ value: { id: string; displayName: string }[] }>(
      `/me/outlook/masterCategories`,
    );
    return data?.value?.find((c) => c.displayName === displayName)?.id ?? null;
  }

  return {
    providerId,

    async listFolders(): Promise<MailFolder[]> {
      const select = 'id,displayName,unreadItemCount,totalItemCount';
      // Resolve each alias to its real folder id so we can tag roles (missing ones 404 — skip).
      const wellKnown = await Promise.all(
        WELL_KNOWN.map(async ({ alias, role }) => {
          try {
            const f = await call<GraphFolder>(`/me/mailFolders/${alias}?$select=id`);
            return f ? { id: f.id, role } : null;
          } catch {
            return null;
          }
        }),
      );
      const roleById = new Map(
        wellKnown.filter((w): w is { id: string; role: FolderRole } => w != null).map((w) => [w.id, w.role]),
      );

      // Enumerate the account's actual top-level folders so the sidebar isn't limited to the aliases.
      const data = await call<{ value: GraphFolder[] }>(
        `/me/mailFolders?$top=100&$select=${select}`,
      );
      return (data?.value ?? []).map((f) => ({
        id: f.id,
        name: f.displayName ?? '',
        role: roleById.get(f.id) ?? null,
        unread: f.unreadItemCount ?? null,
        total: f.totalItemCount ?? null,
      }));
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
      // Step 1: list the conversation's message ids (sort client-side; $orderby is rejected with this $filter).
      const listed = await call<{ value: { id: string; receivedDateTime?: string }[] }>(
        `/me/messages?$filter=${filter}&$select=id,receivedDateTime`,
      );
      const ids = (listed?.value ?? [])
        .sort((a, b) => (a.receivedDateTime ?? '').localeCompare(b.receivedDateTime ?? ''))
        .map((m) => m.id);

      // Step 2: fetch each message in full (guarantees body content).
      const select =
        'id,conversationId,subject,from,toRecipients,ccRecipients,body,bodyPreview,receivedDateTime,hasAttachments';
      const fetched = await Promise.all(
        ids.map((id) => call<GraphFullMessage>(`/me/messages/${id}?$select=${select}`)),
      );
      const msgs = fetched.filter((m): m is GraphFullMessage => m != null);

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
      // System labels map to Graph message properties; everything else is a category. Applied per message.
      const SYSTEM = new Set(['UNREAD', 'STARRED', 'IMPORTANT']);
      const add = new Set(addLabelIds);
      const remove = new Set(removeLabelIds);
      const addCats = addLabelIds.filter((l) => !SYSTEM.has(l));
      const removeCats = removeLabelIds.filter((l) => !SYSTEM.has(l));

      const data = await call<{ value: { id: string; categories?: string[] }[] }>(
        `/me/messages?$filter=conversationId eq '${threadId}'&$select=id,categories`,
      );

      for (const msg of data?.value ?? []) {
        const patch: Record<string, unknown> = {};
        // read state (UNREAD present => not read)
        if (add.has('UNREAD')) patch.isRead = false;
        if (remove.has('UNREAD')) patch.isRead = true;
        // star => flag
        if (add.has('STARRED')) patch.flag = { flagStatus: 'flagged' };
        if (remove.has('STARRED')) patch.flag = { flagStatus: 'notFlagged' };
        // important => importance
        if (add.has('IMPORTANT')) patch.importance = 'high';
        if (remove.has('IMPORTANT')) patch.importance = 'normal';
        // remaining labels => categories
        if (addCats.length || removeCats.length) {
          const next = new Set(msg.categories ?? []);
          addCats.forEach((c) => next.add(c));
          removeCats.forEach((c) => next.delete(c));
          patch.categories = [...next];
        }
        if (Object.keys(patch).length > 0) {
          await call(`/me/messages/${msg.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
        }
      }
    },

    async trashThread(threadId) {
      // Graph has no thread trash; move each message to Deleted Items ('deleteditems').
      const data = await call<{ value: { id: string }[] }>(
        `/me/messages?$filter=conversationId eq '${threadId}'&$select=id`,
      );
      for (const msg of data?.value ?? []) {
        await call(`/me/messages/${msg.id}/move`, {
          method: 'POST',
          body: JSON.stringify({ destinationId: 'deleteditems' }),
        });
      }
    },

    async createDraft(input: DraftInput): Promise<{ id: string }> {
      // A Graph draft is a message with isDraft=true; POST creates, PATCH updates.
      const message = {
        subject: input.subject,
        body: { contentType: 'HTML', content: input.html },
        toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
        ...(input.cc?.length
          ? { ccRecipients: input.cc.map((address) => ({ emailAddress: { address } })) }
          : {}),
        ...(input.bcc?.length
          ? { bccRecipients: input.bcc.map((address) => ({ emailAddress: { address } })) }
          : {}),
      };
      const res = input.id
        ? await call<{ id: string }>(`/me/messages/${input.id}`, {
            method: 'PATCH',
            body: JSON.stringify(message),
          })
        : await call<{ id: string }>(`/me/messages`, {
            method: 'POST',
            body: JSON.stringify(message),
          });
      return { id: res?.id ?? input.id ?? '' };
    },

    async getDraft(id: string): Promise<ParsedDraftResult> {
      const select = 'id,subject,body,toRecipients,ccRecipients,bccRecipients';
      const m = await call<GraphFullMessage & { bccRecipients?: GraphRecipient[] }>(
        `/me/messages/${id}?$select=${select}`,
      );
      const emails = (list?: GraphRecipient[]) => mapRecipients(list).map((r) => r.email);
      return {
        id: m?.id ?? id,
        to: emails(m?.toRecipients),
        cc: emails(m?.ccRecipients),
        bcc: emails(m?.bccRecipients),
        subject: m?.subject ?? '',
        content: m?.body?.content ?? '',
      };
    },

    async listDrafts(opts = {}): Promise<DraftList> {
      const { maxResults = 25, pageToken } = opts;
      const path = pageToken
        ? pageToken.replace(BASE, '')
        : `/me/mailFolders/drafts/messages?$top=${maxResults}&$orderby=receivedDateTime desc&$select=id,conversationId`;
      const data = await call<{ value: { id: string }[]; '@odata.nextLink'?: string }>(path);
      return {
        threads: (data?.value ?? []).map((m) => ({ id: m.id, historyId: null, $raw: m })),
        nextPageToken: data?.['@odata.nextLink'] ?? null,
      };
    },

    async deleteDraft(id: string): Promise<void> {
      await call(`/me/messages/${id}`, { method: 'DELETE' });
    },

    async getEmailAliases() {
      // No send-as list; proxyAddresses hold SMTP addresses ("SMTP:" = primary, "smtp:" = alias).
      const me = await call<{ mail?: string; userPrincipalName?: string; proxyAddresses?: string[] }>(
        `/me?$select=mail,userPrincipalName,proxyAddresses`,
      );
      const primaryEmail = me?.mail ?? me?.userPrincipalName ?? auth.getEmail() ?? '';
      const smtp = (me?.proxyAddresses ?? []).filter((a) => /^smtp:/i.test(a));
      const aliases = smtp.map((a) => ({
        email: a.slice(a.indexOf(':') + 1),
        name: '',
        primary: a.startsWith('SMTP:'),
      }));
      if (!aliases.some((a) => a.primary) && primaryEmail) {
        aliases.unshift({ email: primaryEmail, name: '', primary: true });
      }
      return aliases.length ? aliases : [{ email: primaryEmail, name: '', primary: true }];
    },

    async createLabel(input: { name: string; color?: LabelColor }): Promise<MailLabel> {
      // Graph's label analog is a master category (color is a preset enum; displayName is the id).
      const res = await call<{ id: string; displayName: string }>(`/me/outlook/masterCategories`, {
        method: 'POST',
        body: JSON.stringify({ displayName: input.name, color: 'preset0' }),
      });
      return { id: res?.displayName ?? input.name, name: res?.displayName ?? input.name, type: 'user' };
    },

    async updateLabel(id: string, input: { name: string; color?: LabelColor }): Promise<MailLabel> {
      // PATCH needs the GUID; resolve from displayName. Renaming doesn't retag existing messages.
      const guid = await categoryGuid(id);
      if (guid) {
        await call(`/me/outlook/masterCategories/${guid}`, {
          method: 'PATCH',
          body: JSON.stringify({ displayName: input.name }),
        });
      }
      return { id: input.name, name: input.name, type: 'user' };
    },

    async deleteLabel(id: string): Promise<void> {
      const guid = await categoryGuid(id);
      if (guid) await call(`/me/outlook/masterCategories/${guid}`, { method: 'DELETE' });
    },
  };
}
