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
  FolderChanges,
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

const MESSAGE_SELECT =
  'id,conversationId,subject,from,receivedDateTime,categories,parentFolderId,bodyPreview,hasAttachments';
const DELTA_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// v1.0's mailFolder has no wellKnownName (beta does), so a listed folder identifies itself only by
// its localized displayName. Matching these tags roles off the folder list alone, with no per-alias
// round-trip; buildFolderIndex falls back to WELL_KNOWN when they miss.
const NAME_ROLE: Record<string, FolderRole> = {
  inbox: 'inbox',
  archive: 'archive',
  'sent items': 'sent',
  drafts: 'drafts',
  'junk email': 'spam',
  'deleted items': 'trash',
};

// Gmail-style system labels the UI adds/removes to move a thread; Graph has no such labels, so
// each maps to a real folder the message is moved into (not an Outlook category).
const FOLDER_LABEL_ALIAS: Record<string, string> = {
  TRASH: 'deleteditems',
  SPAM: 'junkemail',
  INBOX: 'inbox',
  ARCHIVE: 'archive',
};

interface GraphDeltaPage {
  value: (GraphMessage & { '@removed'?: { reason?: string } })[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

interface GraphFolder {
  id: string;
  displayName?: string;
  unreadItemCount?: number;
  totalItemCount?: number;
  childFolderCount?: number;
  parentFolderId?: string;
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
  bodyPreview?: string;
  hasAttachments?: boolean;
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

class GraphError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GraphError';
  }
}

// Graph allows 4 concurrent requests per mailbox per app; a 5th is 429 ApplicationThrottled.
const MAX_CONCURRENT = 3;
const MAX_RETRIES = 4;
const BATCH_LIMIT = 20; // Graph rejects a larger $batch

interface BatchSubResponse {
  id: string;
  status: number;
  body?: unknown; // already-parsed JSON, not a string
  headers?: Record<string, string>;
}

let inFlight = 0;
const waiting: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function releaseSlot(): void {
  // Hand the slot to the next waiter (inFlight unchanged) so it can't be jumped.
  const next = waiting.shift();
  if (next) next();
  else inFlight--;
}

async function gated<R>(fn: () => Promise<R>): Promise<R> {
  await acquireSlot();
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function throttleDelayMs(retryAfter: string | null, attempt: number): number {
  const secs = Number(retryAfter);
  if (Number.isFinite(secs) && secs > 0) return secs * 1000;
  return Math.min(2 ** attempt * 500, 8000) + Math.random() * 250;
}

/** Graph's error code, from either a raw response body or an already-parsed $batch subresponse. */
function errorCode(body: unknown): string {
  let parsed: unknown = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      return '';
    }
  }
  return (parsed as { error?: { code?: string } } | null)?.error?.code ?? '';
}

/** A folder alias that resolved to nothing because this mailbox never created that folder. */
function isFolderMissing(status: number, body: unknown): boolean {
  return status === 404 || errorCode(body) === 'ErrorFolderNotFound';
}

/** A deltaToken Graph no longer accepts. Only a full resync recovers. */
function isCursorDead(err: GraphError): boolean {
  return err.status === 410 || err.code === 'resyncRequired' || err.code === 'SyncStateNotFound';
}

export function createGraphDriver(auth: TokenProvider, providerId: string): MailDriver {
  async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
    for (let attempt = 0; ; attempt++) {
      const token = await auth.getAccessToken();

      const { status, ok, retryAfter, body } = await gated(async () => {
        const res = await fetch(`${BASE}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...init?.headers,
          },
        });
        return {
          status: res.status,
          ok: res.ok,
          retryAfter: res.headers.get('Retry-After'),
          // 202/204 (e.g. sendMail) have no body.
          body: res.status === 202 || res.status === 204 ? '' : await res.text(),
        };
      });

      if (ok) return body ? (JSON.parse(body) as T) : null;

      const code = errorCode(body);
      if ((status === 429 || code === 'ApplicationThrottled') && attempt < MAX_RETRIES) {
        await sleep(throttleDelayMs(retryAfter, attempt));
        continue;
      }
      throw new GraphError(
        status,
        code,
        `graph ${init?.method ?? 'GET'} ${path} -> ${status} ${body}`,
      );
    }
  }

  /**
   * Many GETs as one $batch, keyed by url. Graph runs the subrequests concurrently on its side and
   * throttles them individually, so a 429 subresponse can arrive inside a 200 batch; those retry.
   */
  async function batchGet(urls: string[]): Promise<Map<string, BatchSubResponse>> {
    const done = new Map<string, BatchSubResponse>();
    let pending = urls;

    for (let attempt = 0; pending.length > 0; attempt++) {
      const throttled: string[] = [];
      let retryAfter: string | null = null;

      for (let i = 0; i < pending.length; i += BATCH_LIMIT) {
        const chunk = pending.slice(i, i + BATCH_LIMIT);
        const res = await call<{ responses: BatchSubResponse[] }>('/$batch', {
          method: 'POST',
          body: JSON.stringify({
            requests: chunk.map((url, n) => ({ id: String(n), method: 'GET', url })),
          }),
        });

        // Responses come back in arbitrary order; `id` is the index into `chunk`.
        for (const r of res?.responses ?? []) {
          const url = chunk[Number(r.id)];
          if (url === undefined) continue;
          if (r.status === 429) {
            throttled.push(url);
            retryAfter = retryAfter ?? r.headers?.['Retry-After'] ?? null;
          } else {
            done.set(url, r);
          }
        }
      }

      if (throttled.length === 0) break;
      if (attempt >= MAX_RETRIES) {
        throw new GraphError(429, 'ApplicationThrottled', `graph $batch throttled: ${throttled[0]}`);
      }
      await sleep(throttleDelayMs(retryAfter, attempt));
      pending = throttled;
    }

    return done;
  }

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

  /** Resolve a master category's GUID from its displayName (our label id). */
  async function categoryGuid(displayName: string): Promise<string | null> {
    const data = await call<{ value: { id: string; displayName: string }[] }>(
      `/me/outlook/masterCategories`,
    );
    return data?.value?.find((c) => c.displayName === displayName)?.id ?? null;
  }

  /** Cached folder tree + lookup maps (per driver instance; rebuilt on reload/sign-in). */
  interface FolderIndex {
    tree: MailFolder[];
    byId: Set<string>;
    /** lowercased displayName AND 'parent/child' path -> real folder id */
    idByName: Map<string, string>;
    idByRole: Map<FolderRole, string>;
  }
  // The in-flight build is cached, not just its result: listFolders and resolveFolderId both load
  // the index, and caching only the result lets concurrent callers each start their own build.
  let folderIndex: Promise<FolderIndex> | null = null;

  function loadFolderIndex(): Promise<FolderIndex> {
    if (!folderIndex) {
      folderIndex = buildFolderIndex().catch((err) => {
        folderIndex = null; // a partial/throttled build must not be cached
        throw err;
      });
    }
    return folderIndex;
  }

  const SELECT = 'id,displayName,unreadItemCount,totalItemCount,childFolderCount,parentFolderId';
  const listUrl = (path: string) => `${path}?$top=100&$select=${SELECT}`;

  /** Locale-independent role tagging; costs a request, so only runs when NAME_ROLE missed. */
  async function tagByAlias(
    roleById: Map<string, FolderRole>,
    idByRole: Map<FolderRole, string>,
  ): Promise<void> {
    const aliasUrl = (alias: string) => `/me/mailFolders/${alias}?$select=id`;
    const responses = await batchGet(WELL_KNOWN.map((w) => aliasUrl(w.alias)));

    // A mailbox may lack a well-known folder, which is a skip. Anything else must surface —
    // swallowing a throttle here would silently drop a real folder from the cached index.
    const aliasId = (alias: string): string | null => {
      const r = responses.get(aliasUrl(alias));
      if (!r) throw new Error(`graph $batch returned no subresponse for ${alias}`);
      if (isFolderMissing(r.status, r.body)) return null;
      if (r.status >= 400) {
        throw new GraphError(
          r.status,
          errorCode(r.body),
          `graph $batch ${aliasUrl(alias)} -> ${r.status} ${JSON.stringify(r.body)}`,
        );
      }
      return (r.body as GraphFolder | undefined)?.id ?? null;
    };

    for (const { alias, role } of WELL_KNOWN) {
      const id = aliasId(alias);
      if (!id) continue;
      roleById.set(id, role);
      idByRole.set(role, id);
    }
  }

  /** Every folder Graph returns, recursing childFolders. Nothing is filtered out. */
  async function buildFolderIndex(): Promise<FolderIndex> {
    const top = (await call<{ value: GraphFolder[] }>(listUrl('/me/mailFolders')))?.value ?? [];

    const roleById = new Map<string, FolderRole>();
    const idByRole = new Map<FolderRole, string>();

    for (const f of top) {
      const role = NAME_ROLE[(f.displayName ?? '').toLowerCase()];
      if (role) {
        roleById.set(f.id, role);
        idByRole.set(role, f.id);
      }
    }

    // Every mailbox has an inbox, so no inbox match means displayName is localized, not that the
    // folder is absent. Aliases resolve regardless of mailbox language.
    if (!idByRole.has('inbox')) {
      roleById.clear();
      idByRole.clear();
      await tagByAlias(roleById, idByRole);
    }

    const byId = new Set<string>();
    const idByName = new Map<string, string>();

    // Recurse childFolders so nested folders are enumerated and addressable by name/path/id.
    async function buildLevel(parentPath: string, folders: GraphFolder[]): Promise<MailFolder[]> {
      const out: MailFolder[] = [];
      for (const f of folders) {
        const name = f.displayName ?? '';
        const path = parentPath ? `${parentPath}/${name}` : name;
        byId.add(f.id);
        idByName.set(name.toLowerCase(), f.id);
        idByName.set(path.toLowerCase(), f.id);

        let children: MailFolder[] = [];
        if ((f.childFolderCount ?? 0) > 0) {
          const kids =
            (await call<{ value: GraphFolder[] }>(listUrl(`/me/mailFolders/${f.id}/childFolders`)))
              ?.value ?? [];
          children = await buildLevel(path, kids);
        }

        out.push({
          id: f.id,
          name,
          role: roleById.get(f.id) ?? null,
          unread: f.unreadItemCount ?? null,
          total: f.totalItemCount ?? null,
          children,
        });
      }
      return out;
    }

    const tree = await buildLevel('', top);
    return { tree, byId, idByName, idByRole };
  }

  /** Map a folder name / well-known alias / real id to a real Graph folder id (input as fallback). */
  async function resolveFolderId(nameOrId: string): Promise<string> {
    const idx = await loadFolderIndex();
    if (idx.byId.has(nameOrId)) return nameOrId; // already a real folder id
    const key = nameOrId.toLowerCase();
    const wk = WELL_KNOWN.find((w) => w.alias === key);
    if (wk) return idx.idByRole.get(wk.role) ?? nameOrId;
    return idx.idByName.get(key) ?? nameOrId; // custom/nested folder by displayName or path
  }

  return {
    providerId,

    async listFolders(): Promise<MailFolder[]> {
      return (await loadFolderIndex()).tree;
    },

    async listThreads(opts = {}) {
      const { maxResults = 25, labelId, pageToken, q } = opts;
      // pageToken, when present, is a full Graph @odata.nextLink — use it verbatim.
      let path: string;
      if (pageToken) {
        path = pageToken.replace(BASE, '');
      } else if (q) {
        // $search is mailbox-wide and Graph rejects it alongside $orderby — results come back
        // by relevance, not date.
        const qs = new URLSearchParams({
          $top: String(maxResults),
          $select: MESSAGE_SELECT,
          $search: `"${q.replace(/"/g, ' ')}"`,
        });
        path = `/me/messages?${qs.toString()}`;
      } else {
        const folder = labelId ? `/mailFolders/${await resolveFolderId(labelId)}` : '';
        const qs = new URLSearchParams({
          $top: String(maxResults),
          $orderby: 'receivedDateTime desc',
          $select: MESSAGE_SELECT,
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

    async listChanges(folderId: string, cursor: string | null): Promise<FolderChanges> {
      const start = async () => {
        const id = await resolveFolderId(folderId);
        const since = new Date(Date.now() - DELTA_WINDOW_MS).toISOString();
        // Delta accepts only ge/gt on receivedDateTime; it bounds an otherwise whole-folder first pass.
        return `/me/mailFolders/${id}/messages/delta?$select=${MESSAGE_SELECT}&$filter=receivedDateTime ge ${since}`;
      };

      let path = cursor ? cursor.replace(BASE, '') : await start();
      const threads: NormalizedThread[] = [];
      const removedMessageIds: string[] = [];
      let next: string | null = null;

      for (;;) {
        let page: GraphDeltaPage | null;
        try {
          page = await call<GraphDeltaPage>(path);
        } catch (err) {
          if (cursor && err instanceof GraphError && isCursorDead(err)) {
            return { threads: [], removedMessageIds: [], cursor: null, resyncRequired: true };
          }
          throw err;
        }

        for (const m of page?.value ?? []) {
          if (m['@removed']) removedMessageIds.push(m.id);
          else if (m.conversationId) threads.push(toNormalized(m));
        }

        const more = page?.['@odata.nextLink'];
        if (!more) {
          next = page?.['@odata.deltaLink'] ?? null;
          break;
        }
        path = more.replace(BASE, '');
      }

      return { threads, removedMessageIds, cursor: next, resyncRequired: false };
    },

    /**
     * Every tracked folder's delta in one $batch instead of one request per folder. Folders page
     * independently (a busy one may need several rounds while a quiet one is already done), so each
     * round batches only the folders still holding a nextLink.
     */
    async listChangesMany(scopes): Promise<Record<string, FolderChanges>> {
      const out: Record<string, FolderChanges> = {};
      const since = new Date(Date.now() - DELTA_WINDOW_MS).toISOString();

      // folder id -> the next delta url to read. Seeded from the stored deltaLink, or a first pass.
      const pending = new Map<string, string>();
      for (const { folderId, cursor } of scopes) {
        out[folderId] = { threads: [], removedMessageIds: [], cursor: null, resyncRequired: false };
        const id = await resolveFolderId(folderId);
        pending.set(
          folderId,
          cursor
            ? cursor.replace(BASE, '')
            : `/me/mailFolders/${id}/messages/delta?$select=${MESSAGE_SELECT}&$filter=receivedDateTime ge ${since}`,
        );
      }

      // Bounded so a provider that never stops handing back nextLinks can't spin here forever.
      for (let round = 0; pending.size > 0 && round < 50; round++) {
        const urls = [...pending.values()];
        const byUrl = await batchGet(urls);

        // Snapshot: the loop re-seeds `pending` with each folder's nextLink as it goes.
        const inRound = Array.from(pending);
        for (const [folderId, url] of inRound) {
          const res = byUrl.get(url);
          if (!res) continue; // batchGet gave up on it; leave the cursor alone and retry next poll.
          pending.delete(folderId);

          const body = res.body as GraphDeltaPage | null;
          if (res.status >= 400) {
            // A deltaToken Graph no longer accepts. Only a full resync recovers.
            const code = errorCode(body);
            const dead =
              res.status === 410 || code === 'resyncRequired' || code === 'SyncStateNotFound';
            out[folderId] = {
              threads: [],
              removedMessageIds: [],
              cursor: null,
              resyncRequired: dead,
            };
            if (!dead) console.warn(`graph delta(${folderId}) failed: ${res.status} ${code}`);
            continue;
          }

          const acc = out[folderId]!;
          for (const m of body?.value ?? []) {
            if (m['@removed']) acc.removedMessageIds.push(m.id);
            else if (m.conversationId) acc.threads.push(toNormalized(m));
          }

          const more = body?.['@odata.nextLink'];
          if (more) pending.set(folderId, more.replace(BASE, ''));
          else acc.cursor = body?.['@odata.deltaLink'] ?? null;
        }
      }

      return out;
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
          // $select only accepts properties of the base `attachment` type — contentId is declared on
          // the fileAttachment subtype and 400s here. It comes back with the bytes in getAttachment.
          // Dropping $select entirely is not an option: the collection would then carry contentBytes
          // for every attachment in the thread.
          const att = await call<{ value: GraphAttachment[] }>(
            `/me/messages/${m.id}/attachments?$select=id,name,contentType,size,isInline`,
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

      // conversationId is base64 (+,/,=) — encode or the OData $filter silently matches nothing.
      const filter = encodeURIComponent(`conversationId eq '${threadId}'`);
      const data = await call<{ value: { id: string; categories?: string[] }[] }>(
        `/me/messages?$filter=${filter}&$select=id,categories`,
      );

      // Folder-role labels (INBOX/SPAM/TRASH/ARCHIVE) are Gmail-style moves, not categories: an added
      // folder label is the destination; a bare removed folder label means "archive out of here".
      let destAlias: string | null = null;
      for (const l of addLabelIds) if (FOLDER_LABEL_ALIAS[l]) destAlias = FOLDER_LABEL_ALIAS[l];
      // A bare "remove INBOX" (nothing added) is an archive-out; ignore when something else is added
      // (e.g. snooze adds SNOOZED + removes INBOX and must stay a local-only label, not a folder move).
      if (!destAlias && addLabelIds.length === 0 && removeLabelIds.some((l) => FOLDER_LABEL_ALIAS[l]))
        destAlias = 'archive';
      if (destAlias) {
        const dest = await resolveFolderId(destAlias);
        for (const msg of data?.value ?? []) {
          await call(`/me/messages/${msg.id}/move`, {
            method: 'POST',
            body: JSON.stringify({ destinationId: dest }),
          });
        }
        return;
      }

      // Remaining labels are real Outlook categories (exclude system + folder labels).
      const isCat = (l: string) => !SYSTEM.has(l) && !FOLDER_LABEL_ALIAS[l];
      const addCats = addLabelIds.filter(isCat);
      const removeCats = removeLabelIds.filter(isCat);

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
      // Graph has no thread trash; move each message to Deleted Items (like Outlook).
      // Resolve the real Deleted Items folder id from the folder list ('deleteditems' alias -> id).
      const dest = await resolveFolderId('deleteditems');
      // conversationId is base64 (+,/,=) — encode or the OData $filter silently matches nothing.
      const filter = encodeURIComponent(`conversationId eq '${threadId}'`);
      const data = await call<{ value: { id: string }[] }>(
        `/me/messages?$filter=${filter}&$select=id`,
      );
      for (const msg of data?.value ?? []) {
        await call(`/me/messages/${msg.id}/move`, {
          method: 'POST',
          body: JSON.stringify({ destinationId: dest }),
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
