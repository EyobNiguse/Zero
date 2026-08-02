/**
 * Microsoft Graph driver — maps Graph's wire shapes onto the local db's row types.
 * Transport (auth, throttling, $batch, URLs, the folder index) lives in ./graph-client.
 *
 * Mapping: thread -> conversationId; labels -> categories; sendMail returns 202 (no id).
 */
import type { TokenProvider } from '../auth/types';
import type { InsertMessage, InsertAttachment } from '../db/queries';
import { base64Decode } from './mime';
import {
  createGraphClient,
  GraphError,
  errorCode,
  isCursorDead,
  isSubResponseCursorDead,
} from './graph-client';
import type {
  GraphAttachment,
  GraphDeltaPage,
  GraphFullMessage,
  GraphMessage,
  GraphRecipient,
} from './graph-client';
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

// Gmail-style system labels the UI adds/removes to move a thread; Graph has no such labels, so
// each maps to a real folder the message is moved into (not an Outlook category).
const FOLDER_LABEL_ALIAS: Record<string, string> = {
  TRASH: 'deleteditems',
  SPAM: 'junkemail',
  INBOX: 'inbox',
  ARCHIVE: 'archive',
};

/** System labels that are message properties on Graph, not categories. */
const SYSTEM_LABELS = new Set(['UNREAD', 'STARRED', 'IMPORTANT']);

const THREAD_MESSAGE_SELECT =
  'id,conversationId,subject,from,toRecipients,ccRecipients,body,bodyPreview,receivedDateTime,hasAttachments';

function mapRecipient(r?: GraphRecipient): { name?: string; email: string } | null {
  const a = r?.emailAddress;
  return a?.address ? { name: a.name, email: a.address } : null;
}
function mapRecipients(list?: GraphRecipient[]): { name?: string; email: string }[] {
  return (list ?? []).map(mapRecipient).filter((s): s is { name?: string; email: string } => s != null);
}

export function createGraphDriver(auth: TokenProvider, providerId: string): MailDriver {
  const client = createGraphClient(auth);

  function toNormalized(msg: GraphMessage): NormalizedThread {
    const addr = msg.from?.emailAddress;
    // parentFolderId is the primary "label"; categories are extra multi-value labels.
    const labelIds = [...(msg.parentFolderId ? [msg.parentFolderId] : []), ...(msg.categories ?? [])];
    const sender = addr?.address ? { name: addr.name, email: addr.address } : null;
    return {
      thread: {
        id: msg.conversationId,
        threadId: msg.conversationId,
        providerId,
        latestSender: sender,
        latestReceivedOn: msg.receivedDateTime ?? null,
        latestSubject: msg.subject ?? null,
      },
      labelIds,
      latestMessage: {
        id: msg.id,
        threadId: msg.conversationId,
        providerId,
        sender,
        toRecipients: [],
        ccRecipients: [],
        subject: msg.subject ?? null,
        snippet: msg.bodyPreview ?? null,
        bodyHtml: null,
        bodyText: null,
        receivedOn: msg.receivedDateTime ?? null,
        hasAttachments: !!msg.hasAttachments,
      },
    };
  }

  /** Fold one delta page's rows into an accumulator. */
  function applyDeltaPage(page: GraphDeltaPage | null, acc: FolderChanges): void {
    for (const m of page?.value ?? []) {
      if (m['@removed']) acc.removedMessageIds.push(m.id);
      else if (m.conversationId) acc.threads.push(toNormalized(m));
    }
  }

  const emptyChanges = (): FolderChanges => ({
    threads: [],
    removedMessageIds: [],
    cursor: null,
    resyncRequired: false,
  });

  /** Resolve a master category's GUID from its displayName (our label id). */
  async function categoryGuid(displayName: string): Promise<string | null> {
    const cats = await client.listCategories();
    return cats.find((c) => c.displayName === displayName)?.id ?? null;
  }

  /** Recipient lists in the shape Graph's message body wants. */
  const recipients = (list?: string[]) => (list ?? []).map((address) => ({ emailAddress: { address } }));

  return {
    providerId,

    async listThreads(opts = {}) {
      const { maxResults = 25, labelId, pageToken, q } = opts;
      const { value, nextLink } = await client.listMessagesPage({
        folderId: labelId,
        q,
        maxResults,
        nextLink: pageToken,
      });

      // Messages arrive newest-first; keep the first (latest) per conversation.
      const seen = new Set<string>();
      const threads: NormalizedThread[] = [];
      for (const m of value) {
        if (seen.has(m.conversationId)) continue;
        seen.add(m.conversationId);
        threads.push(toNormalized(m));
      }

      return { threads, nextPageToken: nextLink };
    },

    async listChanges(folderId: string, cursor: string | null): Promise<FolderChanges> {
      let url = cursor ?? (await client.deltaStartUrl(folderId));
      const acc = emptyChanges();

      for (;;) {
        let page: GraphDeltaPage | null;
        try {
          page = await client.getDelta(url);
        } catch (err) {
          if (cursor && err instanceof GraphError && isCursorDead(err)) {
            return { ...emptyChanges(), resyncRequired: true };
          }
          throw err;
        }

        applyDeltaPage(page, acc);

        const more = page?.['@odata.nextLink'];
        if (!more) {
          acc.cursor = page?.['@odata.deltaLink'] ?? null;
          break;
        }
        url = more;
      }

      return acc;
    },

    /**
     * Every tracked folder's delta in one $batch instead of one request per folder. Folders page
     * independently (a busy one may need several rounds while a quiet one is already done), so each
     * round batches only the folders still holding a nextLink.
     */
    async listChangesMany(folders): Promise<Record<string, FolderChanges>> {
      const out: Record<string, FolderChanges> = {};

      // folder id -> the next delta url to read. Seeded from the stored deltaLink, or a first pass.
      const pending = new Map<string, string>();
      for (const { folderId, cursor } of folders) {
        out[folderId] = emptyChanges();
        pending.set(folderId, cursor ?? (await client.deltaStartUrl(folderId)));
      }

      // Bounded so a provider that never stops handing back nextLinks can't spin here forever.
      for (let round = 0; pending.size > 0 && round < 50; round++) {
        const byUrl = await client.getDeltaMany([...pending.values()]);

        // Snapshot: the loop re-seeds `pending` with each folder's nextLink as it goes.
        const inRound = Array.from(pending);
        for (const [folderId, url] of inRound) {
          const res = byUrl.get(url);
          if (!res) continue; // batchGet gave up on it; leave the cursor alone and retry next poll.
          pending.delete(folderId);

          const body = res.body as GraphDeltaPage | null;
          if (res.status >= 400) {
            // A deltaToken Graph no longer accepts. Only a full resync recovers.
            const dead = isSubResponseCursorDead(res.status, body);
            out[folderId] = { ...emptyChanges(), resyncRequired: dead };
            if (!dead) {
              console.warn(`graph delta(${folderId}) failed: ${res.status} ${errorCode(body)}`);
            }
            continue;
          }

          const acc = out[folderId]!;
          applyDeltaPage(body, acc);

          const more = body?.['@odata.nextLink'];
          if (more) pending.set(folderId, more);
          else acc.cursor = body?.['@odata.deltaLink'] ?? null;
        }
      }

      return out;
    },

    async getThread(threadId: string): Promise<ThreadDetail> {
      // Step 1: list the conversation's message ids (sort client-side; $orderby is rejected with this $filter).
      const listed = await client.listConversationMessages(threadId, 'id,receivedDateTime');
      const ids = listed
        .sort((a, b) => (a.receivedDateTime ?? '').localeCompare(b.receivedDateTime ?? ''))
        .map((m) => m.id);

      // Step 2: fetch each message in full (guarantees body content).
      const fetched = await Promise.all(
        ids.map((id) => client.getMessage(id, THREAD_MESSAGE_SELECT)),
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
          for (const a of await client.listAttachmentsMeta(m.id)) {
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
      const a: GraphAttachment | null = await client.getAttachmentRaw(messageId, attachmentId);
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
      await client.sendMail({
        subject: input.subject,
        body: { contentType: input.html ? 'HTML' : 'Text', content: input.html ?? input.text },
        toRecipients: recipients(input.to),
        ...(input.cc?.length ? { ccRecipients: recipients(input.cc) } : {}),
        ...(input.bcc?.length ? { bccRecipients: recipients(input.bcc) } : {}),
        ...(fileAttachments.length ? { attachments: fileAttachments } : {}),
      });
      // Graph sendMail yields no id; the sync pass will reconcile the real ids.
      return { id: '', threadId: input.threadId ?? '' };
    },

    async modifyLabels(threadId, addLabelIds, removeLabelIds) {
      // System labels map to Graph message properties; everything else is a category. Applied per message.
      const add = new Set(addLabelIds);
      const remove = new Set(removeLabelIds);

      const msgs = await client.listConversationMessages(threadId, 'id,categories');

      // Folder-role labels (INBOX/SPAM/TRASH/ARCHIVE) are Gmail-style moves, not categories: an added
      // folder label is the destination; a bare removed folder label means "archive out of here".
      let destAlias: string | null = null;
      for (const l of addLabelIds) if (FOLDER_LABEL_ALIAS[l]) destAlias = FOLDER_LABEL_ALIAS[l];
      // A bare "remove INBOX" (nothing added) is an archive-out; ignore when something else is added
      // (e.g. snooze adds SNOOZED + removes INBOX and must stay a local-only label, not a folder move).
      if (!destAlias && addLabelIds.length === 0 && removeLabelIds.some((l) => FOLDER_LABEL_ALIAS[l]))
        destAlias = 'archive';
      if (destAlias) {
        const dest = await client.resolveFolderId(destAlias);
        for (const msg of msgs) await client.moveMessage(msg.id, dest);
        return;
      }

      // Remaining labels are real Outlook categories (exclude system + folder labels).
      const isCat = (l: string) => !SYSTEM_LABELS.has(l) && !FOLDER_LABEL_ALIAS[l];
      const addCats = addLabelIds.filter(isCat);
      const removeCats = removeLabelIds.filter(isCat);

      for (const msg of msgs) {
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
        if (Object.keys(patch).length > 0) await client.patchMessage(msg.id, patch);
      }
    },

    async trashThread(threadId) {
      // Graph has no thread trash; move each message to Deleted Items (like Outlook).
      const dest = await client.resolveFolderId('deleteditems');
      const msgs = await client.listConversationMessages(threadId, 'id');
      for (const msg of msgs) await client.moveMessage(msg.id, dest);
    },

    async createDraft(input: DraftInput): Promise<{ id: string }> {
      // A Graph draft is a message with isDraft=true; POST creates, PATCH updates.
      const res = await client.putMessage(
        {
          subject: input.subject,
          body: { contentType: 'HTML', content: input.html },
          toRecipients: recipients(input.to),
          ...(input.cc?.length ? { ccRecipients: recipients(input.cc) } : {}),
          ...(input.bcc?.length ? { bccRecipients: recipients(input.bcc) } : {}),
        },
        input.id,
      );
      return { id: res?.id ?? input.id ?? '' };
    },

    async getDraft(id: string): Promise<ParsedDraftResult> {
      const m = await client.getMessage(id, 'id,subject,body,toRecipients,ccRecipients,bccRecipients');
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
      const { value, nextLink } = await client.listDraftMessages(opts);
      return {
        threads: value.map((m) => ({ id: m.id, historyId: null, $raw: m })),
        nextPageToken: nextLink,
      };
    },

    deleteDraft(id: string): Promise<void> {
      return client.deleteMessage(id);
    },

    async getEmailAliases() {
      // No send-as list; proxyAddresses hold SMTP addresses ("SMTP:" = primary, "smtp:" = alias).
      const me = await client.getMe();
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
      const res = await client.createCategory(input.name);
      return { id: res?.displayName ?? input.name, name: res?.displayName ?? input.name, type: 'user' };
    },

    async updateLabel(id: string, input: { name: string; color?: LabelColor }): Promise<MailLabel> {
      // PATCH needs the GUID; resolve from displayName. Renaming doesn't retag existing messages.
      const guid = await categoryGuid(id);
      if (guid) await client.updateCategory(guid, input.name);
      return { id: input.name, name: input.name, type: 'user' };
    },

    async deleteLabel(id: string): Promise<void> {
      const guid = await categoryGuid(id);
      if (guid) await client.deleteCategory(guid);
    },
  };
}
