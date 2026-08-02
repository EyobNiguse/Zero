import type { TokenProvider } from '../auth/types';
import type { FolderRole } from './types';

const BASE = 'https://graph.microsoft.com/v1.0';

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

const NAME_ROLE: Record<string, FolderRole> = {
  inbox: 'inbox',
  archive: 'archive',
  'sent items': 'sent',
  drafts: 'drafts',
  'junk email': 'spam',
  'deleted items': 'trash',
};

// --- wire shapes -------------------------------------------------------------

export interface GraphDeltaPage {
  value: (GraphMessage & { '@removed'?: { reason?: string } })[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

export interface GraphFolder {
  id: string;
  displayName?: string;
  unreadItemCount?: number;
  totalItemCount?: number;
  childFolderCount?: number;
  parentFolderId?: string;
}

export interface GraphRecipient {
  emailAddress?: { name?: string; address?: string };
}

export interface GraphMessage {
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

export interface GraphFullMessage extends GraphMessage {
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
  body?: { contentType?: string; content?: string };
}

export interface GraphAttachment {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentId?: string;
  contentBytes?: string;
}

export interface BatchSubResponse {
  id: string;
  status: number;
  body?: unknown; // already-parsed JSON, not a string
  headers?: Record<string, string>;
}

/** A folder plus the role we tagged it with and its children — Graph's own shape, not the mirror's. */
export interface GraphFolderNode extends GraphFolder {
  role: FolderRole | null;
  children: GraphFolderNode[];
}

export interface GraphFolderIndex {
  roots: GraphFolderNode[];
  byId: Set<string>;
  /** lowercased displayName AND 'parent/child' path -> real folder id */
  idByName: Map<string, string>;
  idByRole: Map<FolderRole, string>;
}

export class GraphError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GraphError';
  }
}

/** Graph's error code, from either a raw response body or an already-parsed $batch subresponse. */
export function errorCode(body: unknown): string {
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
export function isCursorDead(err: GraphError): boolean {
  return err.status === 410 || err.code === 'resyncRequired' || err.code === 'SyncStateNotFound';
}

/** Same test against a $batch subresponse, where there is no GraphError to inspect. */
export function isSubResponseCursorDead(status: number, body: unknown): boolean {
  const code = errorCode(body);
  return status === 410 || code === 'resyncRequired' || code === 'SyncStateNotFound';
}

// --- throttling --------------------------------------------------------------

// Graph allows 4 concurrent requests per mailbox per app; a 5th is 429 ApplicationThrottled.
const MAX_CONCURRENT = 3;
const MAX_RETRIES = 4;
const BATCH_LIMIT = 20; // Graph rejects a larger $batch

// Module-global on purpose: the limit is per mailbox, not per client instance.
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

// --- client ------------------------------------------------------------------

export interface GraphClient {
  /** Cached per instance; rebuilt on reload/sign-in. */
  getFolderIndex(): Promise<GraphFolderIndex>;
  /** Folder name / well-known alias / real id -> real Graph folder id (input as fallback). */
  resolveFolderId(nameOrId: string): Promise<string>;

  listMessagesPage(opts: {
    folderId?: string;
    q?: string;
    maxResults?: number;
    nextLink?: string;
  }): Promise<{ value: GraphMessage[]; nextLink: string | null }>;

  /** Message ids + receivedDateTime for one conversation, unsorted. */
  listConversationMessages(
    threadId: string,
    select: string,
  ): Promise<{ id: string; receivedDateTime?: string; categories?: string[] }[]>;

  getMessage(id: string, select: string): Promise<GraphFullMessage | null>;
  listAttachmentsMeta(messageId: string): Promise<GraphAttachment[]>;
  getAttachmentRaw(messageId: string, attachmentId: string): Promise<GraphAttachment | null>;

  /** First-pass delta url for a folder, windowed to the last 30 days. */
  deltaStartUrl(folderIdOrAlias: string): Promise<string>;
  getDelta(url: string): Promise<GraphDeltaPage | null>;
  /** Many folders' delta in one $batch. Keyed by the exact url passed in. */
  getDeltaMany(urls: string[]): Promise<Map<string, BatchSubResponse>>;

  sendMail(message: unknown): Promise<void>;
  moveMessage(messageId: string, destinationId: string): Promise<void>;
  patchMessage(messageId: string, patch: unknown): Promise<void>;
  /** id present => PATCH that message, else POST a new one. */
  putMessage(message: unknown, id?: string | null): Promise<{ id: string } | null>;
  deleteMessage(id: string): Promise<void>;

  listDraftMessages(opts: {
    maxResults?: number;
    pageToken?: string;
  }): Promise<{ value: { id: string }[]; nextLink: string | null }>;

  getMe(): Promise<{
    mail?: string;
    userPrincipalName?: string;
    proxyAddresses?: string[];
  } | null>;

  listCategories(): Promise<{ id: string; displayName: string }[]>;
  createCategory(displayName: string): Promise<{ id: string; displayName: string } | null>;
  updateCategory(guid: string, displayName: string): Promise<void>;
  deleteCategory(guid: string): Promise<void>;
}

export function createGraphClient(auth: TokenProvider): GraphClient {
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
            // Keys stay the caller's url; only the request is normalized to a relative path.
            requests: chunk.map((url, n) => ({ id: String(n), method: 'GET', url: rel(url) })),
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

  /** Graph hands back absolute nextLink/deltaLink urls; every request path here is relative. */
  const rel = (url: string) => url.replace(BASE, '');

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
  async function buildFolderIndex(): Promise<GraphFolderIndex> {
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
    async function buildLevel(
      parentPath: string,
      folders: GraphFolder[],
    ): Promise<GraphFolderNode[]> {
      const out: GraphFolderNode[] = [];
      for (const f of folders) {
        const name = f.displayName ?? '';
        const path = parentPath ? `${parentPath}/${name}` : name;
        byId.add(f.id);
        idByName.set(name.toLowerCase(), f.id);
        idByName.set(path.toLowerCase(), f.id);

        let children: GraphFolderNode[] = [];
        if ((f.childFolderCount ?? 0) > 0) {
          const kids =
            (await call<{ value: GraphFolder[] }>(listUrl(`/me/mailFolders/${f.id}/childFolders`)))
              ?.value ?? [];
          children = await buildLevel(path, kids);
        }

        out.push({ ...f, role: roleById.get(f.id) ?? null, children });
      }
      return out;
    }

    const roots = await buildLevel('', top);
    return { roots, byId, idByName, idByRole };
  }

  // The in-flight build is cached, not just its result: listFolders and resolveFolderId both load
  // the index, and caching only the result lets concurrent callers each start their own build.
  let folderIndex: Promise<GraphFolderIndex> | null = null;

  function loadFolderIndex(): Promise<GraphFolderIndex> {
    if (!folderIndex) {
      folderIndex = buildFolderIndex().catch((err) => {
        folderIndex = null; // a partial/throttled build must not be cached
        throw err;
      });
    }
    return folderIndex;
  }

  async function resolveFolderId(nameOrId: string): Promise<string> {
    const idx = await loadFolderIndex();
    if (idx.byId.has(nameOrId)) return nameOrId; // already a real folder id
    const key = nameOrId.toLowerCase();
    const wk = WELL_KNOWN.find((w) => w.alias === key);
    if (wk) return idx.idByRole.get(wk.role) ?? nameOrId;
    return idx.idByName.get(key) ?? nameOrId; // custom/nested folder by displayName or path
  }

  return {
    getFolderIndex: loadFolderIndex,
    resolveFolderId,

    async listMessagesPage({ folderId, q, maxResults = 25, nextLink }) {
      let path: string;
      if (nextLink) {
        // A full Graph @odata.nextLink — use it verbatim.
        path = rel(nextLink);
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
        const folder = folderId ? `/mailFolders/${await resolveFolderId(folderId)}` : '';
        const qs = new URLSearchParams({
          $top: String(maxResults),
          $orderby: 'receivedDateTime desc',
          $select: MESSAGE_SELECT,
        });
        path = `/me${folder}/messages?${qs.toString()}`;
      }

      const data = await call<{ value: GraphMessage[]; '@odata.nextLink'?: string }>(path);
      return { value: data?.value ?? [], nextLink: data?.['@odata.nextLink'] ?? null };
    },

    async listConversationMessages(threadId, select) {
      // conversationId is base64 (+,/,=) — encode or the OData $filter silently matches nothing.
      const filter = encodeURIComponent(`conversationId eq '${threadId}'`);
      const data = await call<{
        value: { id: string; receivedDateTime?: string; categories?: string[] }[];
      }>(`/me/messages?$filter=${filter}&$select=${select}`);
      return data?.value ?? [];
    },

    getMessage(id, select) {
      return call<GraphFullMessage>(`/me/messages/${id}?$select=${select}`);
    },

    async listAttachmentsMeta(messageId) {
      // $select only accepts properties of the base `attachment` type — contentId is declared on
      // the fileAttachment subtype and 400s here. It comes back with the bytes in getAttachmentRaw.
      // Dropping $select entirely is not an option: the collection would then carry contentBytes
      // for every attachment in the thread.
      const att = await call<{ value: GraphAttachment[] }>(
        `/me/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline`,
      );
      return att?.value ?? [];
    },

    getAttachmentRaw(messageId, attachmentId) {
      return call<GraphAttachment>(`/me/messages/${messageId}/attachments/${attachmentId}`);
    },

    async deltaStartUrl(folderIdOrAlias) {
      const id = await resolveFolderId(folderIdOrAlias);
      const since = new Date(Date.now() - DELTA_WINDOW_MS).toISOString();
      // Delta accepts only ge/gt on receivedDateTime; it bounds an otherwise whole-folder first pass.
      return `/me/mailFolders/${id}/messages/delta?$select=${MESSAGE_SELECT}&$filter=receivedDateTime ge ${since}`;
    },

    getDelta(url) {
      return call<GraphDeltaPage>(rel(url));
    },

    getDeltaMany(urls) {
      return batchGet(urls);
    },

    async sendMail(message) {
      await call(`/me/sendMail`, {
        method: 'POST',
        body: JSON.stringify({ message, saveToSentItems: true }),
      });
    },

    async moveMessage(messageId, destinationId) {
      await call(`/me/messages/${messageId}/move`, {
        method: 'POST',
        body: JSON.stringify({ destinationId }),
      });
    },

    async patchMessage(messageId, patch) {
      await call(`/me/messages/${messageId}`, { method: 'PATCH', body: JSON.stringify(patch) });
    },

    putMessage(message, id) {
      const body = JSON.stringify(message);
      return id
        ? call<{ id: string }>(`/me/messages/${id}`, { method: 'PATCH', body })
        : call<{ id: string }>(`/me/messages`, { method: 'POST', body });
    },

    async deleteMessage(id) {
      await call(`/me/messages/${id}`, { method: 'DELETE' });
    },

    async listDraftMessages({ maxResults = 25, pageToken }) {
      const path = pageToken
        ? rel(pageToken)
        : `/me/mailFolders/drafts/messages?$top=${maxResults}&$orderby=receivedDateTime desc&$select=id,conversationId`;
      const data = await call<{ value: { id: string }[]; '@odata.nextLink'?: string }>(path);
      return { value: data?.value ?? [], nextLink: data?.['@odata.nextLink'] ?? null };
    },

    getMe() {
      return call<{ mail?: string; userPrincipalName?: string; proxyAddresses?: string[] }>(
        `/me?$select=mail,userPrincipalName,proxyAddresses`,
      );
    },

    async listCategories() {
      const data = await call<{ value: { id: string; displayName: string }[] }>(
        `/me/outlook/masterCategories`,
      );
      return data?.value ?? [];
    },

    createCategory(displayName) {
      // Color is a preset enum; the driver's LabelColor has no mapping onto it.
      return call<{ id: string; displayName: string }>(`/me/outlook/masterCategories`, {
        method: 'POST',
        body: JSON.stringify({ displayName, color: 'preset0' }),
      });
    },

    async updateCategory(guid, displayName) {
      await call(`/me/outlook/masterCategories/${guid}`, {
        method: 'PATCH',
        body: JSON.stringify({ displayName }),
      });
    },

    async deleteCategory(guid) {
      await call(`/me/outlook/masterCategories/${guid}`, { method: 'DELETE' });
    },
  };
}
