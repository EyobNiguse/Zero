import {
  hydrateThreads,
  hydrateMessages,
  hydrateMessageStubs,
  getThreadMessages,
  getMessageAttachments,
  getAttachmentBody,
  setAttachmentBody,
  getThreadLabels,
  applyThreadLabels,
  findThreadsByFolderWithPagination,
  getFolderThreadSenders,
  searchThreads,
  replaceFolders,
  getFolders,
  setFolderDeltaCursor,
  deleteMessagesByIds,
  pruneThreadMessages,
  pruneFolderMembership,
  getOutbox,
  listOutboxDrafts,
  del,
  get,
  type Folder,
  type OutboxPayload,
} from '../db';
import type { LocalDB } from '../db';
import DOMPurify from 'dompurify';
import { getActiveDriver, getActiveProvider, getLocalDB, localSignOut } from './bridge';
import { toParsedMessage, toThreadResponse } from './adapters';
import type { ProviderId } from '../auth';
import type { FolderRole, FolderChanges } from '../mail/types';
import * as store from './local-store';
import { bytesToBase64 } from '../mail/mime';
import {
  folderStale,
  threadStale,
  markFolderSynced,
  markThreadSynced,
  getPageCursor,
  setPageCursor,
  setSnooze,
  clearSnooze,
  dueSnoozes,
  invalidateAllFolders,
  resetSyncState,
} from './sync-state';
import { dedupe, emitMirrorChanged } from './mirror';
import { saveDraft, queueSend, cancelSend, discardDraft, flushOutbox, syncDrafts } from './outbox';

// Map lowercase standard folder names to each provider's id; pass real (case-sensitive) provider ids through unchanged.
function providerFolder(provider: ProviderId, folder: string | undefined): string {
  const raw = folder ?? 'inbox';
  const key = raw.toLowerCase();
  const google: Record<string, string> = {
    inbox: 'INBOX', sent: 'SENT', draft: 'DRAFT', drafts: 'DRAFT',
    spam: 'SPAM', bin: 'TRASH', trash: 'TRASH',
    // Gmail has no ARCHIVE label; synthetic mirror key, syncFolder maps it to `in:archive`.
    archive: 'archive',
    important: 'IMPORTANT', starred: 'STARRED',
  };
  const microsoft: Record<string, string> = {
    inbox: 'inbox', sent: 'sentitems', draft: 'drafts', drafts: 'drafts',
    spam: 'junkemail', bin: 'deleteditems', trash: 'deleteditems', archive: 'archive',
  };
  return (provider === 'google' ? google : microsoft)[key] ?? raw;
}

// SQLite-primary reads; sync from provider only when a folder/thread is stale (>TTL) or absent.
const PAGE_SIZE = 25;

// Bigger attachments are still served, just never persisted — one 40MB video would bloat the OPFS
// file (and base64 costs another third on top) for a file that is usually opened once.
const ATTACHMENT_CACHE_MAX_BYTES = 10 * 1024 * 1024;

/** Run a provider call, retrying once (warms the token cache after a login/redirect). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

function listArgs(providerId: ProviderId, folderId: string, pageToken?: string) {
  // Gmail archive isn't a label — fetch by search, store under the synthetic 'archive' key.
  const scope =
    providerId === 'google' && folderId === 'archive'
      ? { q: 'in:archive' }
      : { labelId: folderId };
  return { ...scope, maxResults: PAGE_SIZE, ...(pageToken ? { pageToken } : {}) };
}

/**
 * Gmail hands back a thread's complete label set, so it can be written as-is. Two adjustments:
 * `archive` is a mirror-only key (Gmail has no such label — it's "in no other folder"), and the
 * scope we asked for is added so a thread always carries the folder it was listed under.
 */
function withMirrorLabels(providerId: ProviderId, labelIds: string[], scope?: string): string[] {
  const out = new Set(labelIds);
  if (scope) out.add(scope);

  if (providerId === 'google') {
    const filed = ['INBOX', 'SPAM', 'TRASH', 'DRAFT'].some((l) => out.has(l));
    if (filed) out.delete('archive');
    else out.add('archive');
  }
  return [...out];
}

/** Gmail's label set is the whole truth for a thread; Graph's is one message's folder. */
const authoritativeLabels = (providerId: ProviderId) => providerId === 'google';

async function mirrorPage(
  db: LocalDB,
  providerId: ProviderId,
  folderId: string,
  pageToken?: string,
): Promise<string | null> {
  const driver = getActiveDriver();
  const page = await withRetry(() => driver.listThreads(listArgs(providerId, folderId, pageToken)));
  for (const t of page.threads) {
    t.labelIds = withMirrorLabels(providerId, t.labelIds, folderId);
  }
  await hydrateThreads(db, page.threads, { replaceLabels: authoritativeLabels(providerId) });
  await hydrateMessageStubs(
    db,
    page.threads.map((t) => t.latestMessage).filter((m): m is NonNullable<typeof m> => m != null),
  );

  // Graph can't say what a thread's other folders are, so the only removal signal is absence from
  // the folder we just listed. Bounded to the page's own date range — older threads weren't in the
  // window, so we can't speak for them. First page only: a paged read isn't the current top of the
  // folder and would prune threads that are simply on an earlier page.
  if (!pageToken && !authoritativeLabels(providerId)) {
    const dates = page.threads
      .map((t) => t.thread.latestReceivedOn)
      .filter((d): d is string => d != null);
    if (dates.length > 0) {
      const since = dates.reduce((a, b) => (a < b ? a : b));
      const ids = page.threads.map((t) => t.thread.id);
      await pruneFolderMembership(db, folderId, ids, since);
    }
  }

  await setPageCursor(db, providerId, folderId, page.nextPageToken);
  return page.nextPageToken;
}

/** Pull the latest page of a folder from the provider into the SQLite mirror. */
async function syncFolder(db: LocalDB, folderId: string): Promise<void> {
  const providerId = getActiveProvider()!.provider;
  await mirrorPage(db, providerId, folderId);
  await markFolderSynced(db, providerId, folderId);
}

/**
 * Mirror the provider's hits for a search term. They keep the labels the provider gave them — a hit
 * is a real thread in a real folder, not a member of some synthetic "search" folder.
 */
async function syncSearch(db: LocalDB, q: string, pageToken?: string): Promise<void> {
  const driver = getActiveDriver();
  const providerId = getActiveProvider()!.provider;
  try {
    const page = await withRetry(() =>
      driver.listThreads({ q, maxResults: PAGE_SIZE, ...(pageToken ? { pageToken } : {}) }),
    );
    for (const t of page.threads) {
      t.labelIds = withMirrorLabels(providerId, t.labelIds);
    }
    // No scope to prune against — a search spans every folder — but the labels a hit comes back with
    // are still current, so Gmail's set replaces what the mirror holds.
    await hydrateThreads(db, page.threads, { replaceLabels: authoritativeLabels(providerId) });
    await hydrateMessageStubs(
      db,
      page.threads.map((t) => t.latestMessage).filter((m): m is NonNullable<typeof m> => m != null),
    );
    // Paged under the query itself, so scrolling a search pulls the next page of hits.
    await setPageCursor(db, providerId, `search:${q}`, page.nextPageToken);
  } catch (e) {
    console.warn(`search(${q}) failed, serving mirror`, e);
  }
}

async function syncNextSearchPage(db: LocalDB, q: string): Promise<void> {
  const pageToken = await getPageCursor(db, `search:${q}`);
  if (!pageToken) return;
  await syncSearch(db, q, pageToken);
}

/**
 * The mirror ran out of threads but the provider has more — pull the next provider page.
 * Returns false when the folder is fully mirrored.
 */
async function syncNextPage(db: LocalDB, folderId: string): Promise<boolean> {
  const providerId = getActiveProvider()!.provider;
  const pageToken = await getPageCursor(db, folderId);
  if (!pageToken) return false;
  await mirrorPage(db, providerId, folderId, pageToken);
  return true;
}

/** Pull one thread's full contents from the provider into the SQLite mirror. */
async function syncThread(db: LocalDB, threadId: string): Promise<void> {
  const driver = getActiveDriver();
  const providerId = getActiveProvider()!.provider;
  const detail = await withRetry(() => driver.getThread(threadId));
  await hydrateMessages(db, detail.messages, detail.attachments);
  // The provider's list is the whole truth for this thread. Anything else we hold is a message it
  // moved (Graph gives it a new id) or deleted — keeping it would duplicate the thread.
  await pruneThreadMessages(
    db,
    threadId,
    detail.messages.map((m) => m.id),
  );
  await markThreadSynced(db, providerId, threadId);
}

/** Freshness key for the folder tree itself; distinct from any real folder id. */
const TREE_SCOPE = '__tree__';

async function syncFolderTree(db: LocalDB): Promise<void> {
  const driver = getActiveDriver();
  const providerId = getActiveProvider()!.provider;
  const tree = await withRetry(() => driver.listFolders());
  await replaceFolders(db, providerId, tree, new Date().toISOString());
  await markFolderSynced(db, providerId, TREE_SCOPE);
}

// Gmail-style folder labels -> the mirror folder key each view filters on. Graph moves the message
// to a real folder, so the mirror must swap the folder label to match (not store 'TRASH' etc.).
const MS_MIRROR_FOLDER: Record<string, string> = {
  TRASH: 'deleteditems',
  SPAM: 'junkemail',
  INBOX: 'inbox',
  ARCHIVE: 'archive',
};

/** The mirror keys a thread's folder by label, so these are the labels a move has to be exclusive across. */
const MS_FOLDERS = ['inbox', 'sentitems', 'archive', 'junkemail', 'deleteditems', 'drafts'];
const GOOGLE_FOLDERS = ['INBOX', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'archive'];

/**
 * A folder move is exclusive — but the UI only ever asks to remove INBOX or SPAM (see
 * lib/thread-actions), so binning a thread from Sent removed nothing and the mirror kept it in Sent
 * even though the provider had moved it out. Work out what the thread actually left, rather than
 * trusting the caller's remove list.
 *
 * Microsoft: a message lives in exactly one folder, so any move clears every other folder.
 * Gmail: labels stack, but TRASH and SPAM are views that pull the thread out of all the others.
 */
function exclusiveMove(provider: ProviderId, add: string[], remove: string[]): string[] {
  const folders = provider === 'microsoft' ? MS_FOLDERS : GOOGLE_FOLDERS;
  const dest = add.find((l) => folders.includes(l));

  if (!dest) return remove;
  if (provider === 'google' && dest !== 'TRASH' && dest !== 'SPAM') return remove;

  return [...new Set([...remove, ...folders.filter((f) => f !== dest)])];
}

/** Apply a label change to one thread: provider first, then the local mirror. */
async function modifyThread(threadId: string, add: string[], remove: string[]): Promise<void> {
  const driver = getActiveDriver();
  const db = await getLocalDB();
  const provider = getActiveProvider()!.provider;
  await driver.modifyLabels(threadId, add, remove);

  let mAdd = add;
  let mRemove = remove;
  if (provider === 'microsoft') {
    mAdd = add.map((l) => MS_MIRROR_FOLDER[l] ?? l);
    mRemove = remove.map((l) => MS_MIRROR_FOLDER[l] ?? l);
    // Archive-out (remove INBOX, no folder add) still needs to land in the archive view.
    if (mAdd.length === 0 && remove.includes('INBOX')) mAdd = ['archive'];
  }

  const folders = provider === 'microsoft' ? MS_FOLDERS : GOOGLE_FOLDERS;
  const folderMove = mAdd.some((l) => folders.includes(l)) || mRemove.some((l) => folders.includes(l));

  await applyThreadLabels(db, threadId, mAdd, exclusiveMove(provider, mAdd, mRemove));

  // Where the change was a folder move, Graph re-ids every message in the thread, so re-read it
  // rather than trust the label edit above. Behind the response — the edit is enough for the list.
  await afterThreadWrite(db, threadId, folderMove);
}

/**
 * A write landed at the provider, so the mirror's copy of that thread is stale — re-pull it, and drop
 * the folder TTLs so the folders it moved between re-read too.
 */
async function afterThreadWrite(db: LocalDB, threadId: string, moved: boolean): Promise<void> {
  await invalidateAllFolders(db);
  if (!moved || isOffline()) return;

  void dedupe(`thread:${threadId}`, async () => {
    try {
      await syncThread(db, threadId);
      emitMirrorChanged();
    } catch (e) {
      console.warn(`re-sync of ${threadId} after a write failed`, e);
    }
  });
}

/** Flip a single label on a thread based on its current state. */
async function toggleLabel(threadId: string, label: string): Promise<void> {
  const db = await getLocalDB();
  const has = (await getThreadLabels(db, threadId)).some((l) => l.name === label);
  await modifyThread(threadId, has ? [] : [label], has ? [label] : []);
}

/** Pull every scope (a folder, or each selected label) into the mirror. */
async function syncScopes(db: LocalDB, scopes: string[]): Promise<void> {
  for (const scope of scopes) {
    // Degrade to the mirror on provider failure (e.g. a folder that doesn't exist, like the
    // One-Click Archive folder on a mailbox that never used it) instead of failing the list.
    try {
      await syncFolder(db, scope);
    } catch (e) {
      console.warn(`syncFolder(${scope}) failed, serving mirror`, e);
    }
  }
}

// A sync ends in emitMirrorChanged, which makes the UI re-read, which re-enters the resolver — so an
// ungated refresh-on-open loops forever. This is the floor between two refreshes of the same scope:
// short enough that opening a folder always feels live, long enough to swallow the re-read.
const REVALIDATE_MS = 5_000;
const lastRevalidate = new Map<string, number>();

/** Refresh behind an already-served response, then tell the UI to re-read. */
function revalidateScopes(db: LocalDB, scopes: string[]): void {
  const key = scopes.join('|');
  const now = Date.now();

  // Keyed on attempt, not success: syncScopes swallows provider errors, so a scope that always
  // fails would otherwise re-emit and re-enter on every pass.
  if (now - (lastRevalidate.get(key) ?? 0) < REVALIDATE_MS) return;
  lastRevalidate.set(key, now);

  void dedupe(key, async () => {
    await syncScopes(db, scopes);
    emitMirrorChanged();
  });
}

/** No network: the mirror is the only source. Skips a sync that would just time out. */
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** How long a queued send sits before the flusher takes it — the window `mail.unsend` recalls it in. */
const UNDO_SEND_MS = 15_000;

/** Nudge the flusher when the wait is short. Anything further out is picked up by the poll tick. */
function scheduleFlush(delayMs: number): void {
  if (delayMs > 60_000) return;
  setTimeout(() => void flushOutbox(), Math.max(0, delayMs) + 250);
}

/** Normalize the compose payloads (send sends objects, draft-save sends comma-joined strings). */
function toOutboxPayload(input: any): OutboxPayload {
  const emails = (list: unknown): string[] => {
    if (!list) return [];
    if (typeof list === 'string') {
      return list.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return (list as any[])
      .map((r) => (typeof r === 'string' ? r : r?.email))
      .filter((e): e is string => !!e);
  };
  const headers: Record<string, string> = input?.headers ?? {};

  return {
    to: emails(input?.to),
    cc: emails(input?.cc),
    bcc: emails(input?.bcc),
    subject: input?.subject ?? '',
    html: input?.message ?? '',
    fromEmail: input?.fromEmail ?? undefined,
    inReplyTo: headers['In-Reply-To'] || undefined,
    references: headers['References'] || undefined,
    attachments: (input?.attachments ?? [])
      .map((a: any) => ({
        filename: a.name ?? a.filename ?? '',
        mimeType: a.type ?? a.mimeType ?? 'application/octet-stream',
        // serializeFiles() calls it `data`; the older shape called it `base64`.
        contentBase64: a.data ?? a.base64 ?? '',
      }))
      .filter((a: { contentBase64: string }) => !!a.contentBase64),
  };
}

/** Re-read the folder tree after a label write, so the sidebar reflects it without a second round trip. */
async function refreshFolderTree(): Promise<void> {
  const db = await getLocalDB();
  await invalidateAllFolders(db);
  try {
    await syncFolderTree(db);
    emitMirrorChanged();
  } catch (e) {
    // The write landed; only the re-read failed. The invalidation above makes the next read re-pull.
    console.warn('syncFolderTree after a label write failed', e);
  }
}

/** Pull the provider's drafts into the outbox. Blocks only when there is nothing local to show. */
async function refreshDrafts(db: LocalDB, maxResults: number, blocking: boolean): Promise<void> {
  if (isOffline()) return;

  const key = 'drafts';
  if (Date.now() - (lastRevalidate.get(key) ?? 0) < REVALIDATE_MS) return;
  lastRevalidate.set(key, Date.now());

  const run = dedupe(key, async () => {
    try {
      await syncDrafts(db, maxResults);
      emitMirrorChanged();
    } catch (e) {
      console.warn('syncDrafts failed, serving the outbox', e);
    }
  });
  if (blocking) await run;
}

/** The thread the user actually opened. `?threadId` is what the detail view renders. */
function isOpenThread(id: string): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('threadId') === id;
}

/** Return threads whose snooze has expired to the inbox. Local-only: nothing changed at the provider. */
async function wakeSnoozed(db: LocalDB, inbox: string): Promise<boolean> {
  const due = await dueSnoozes(db, Date.now());
  if (due.length === 0) return false;

  await Promise.all(
    due.map(async (id) => {
      await applyThreadLabels(db, id, [inbox], ['SNOOZED']);
      await clearSnooze(db, id);
    }),
  );
  return true;
}

/** The folders worth keeping current in the background. Anything else refreshes when it's opened. */
const POLLED_ROLES = new Set<FolderRole>(['inbox', 'sent', 'archive', 'trash', 'spam']);

/**
 * Wake due snoozes, then pull what changed since the stored cursor.
 *
 * Gmail's history is mailbox-wide, so one call covers every folder — and because its label sets are
 * complete, threads that left a folder lose the label. Graph's delta is per-folder, so it runs once
 * per folder we track, and a thread leaving shows up as a removed message id (a Graph move re-ids the
 * message, so the id we held is genuinely gone).
 */
export async function pollChanges(): Promise<void> {
  const provider = getActiveProvider();
  if (!provider) return;

  const providerId = provider.provider;
  const db = await getLocalDB();
  const inboxScope = providerFolder(providerId, 'inbox');

  // Snoozes are local, so they wake with or without a network.
  const woke = await wakeSnoozed(db, inboxScope);
  if (woke) emitMirrorChanged();

  if (isOffline()) return;
  const driver = getActiveDriver();

  // No delta API on this provider: refresh the folder page, as the old interval did.
  if (!driver.listChanges) {
    await syncScopes(db, [inboxScope]);
    lastRevalidate.set(inboxScope, Date.now());
    emitMirrorChanged();
    return;
  }

  const folders = await getFolders(db, providerId);

  // Gmail: one mailbox-wide history read. The cursor is the mailbox's historyId; it is parked on the
  // inbox row because that is the only folder row guaranteed to exist.
  const scopes =
    providerId === 'google'
      ? folders.filter((f) => f.role === 'inbox').map((f) => ({ folder: f, scope: null }))
      : folders
          .filter((f) => f.role && POLLED_ROLES.has(f.role))
          .map((f) => ({ folder: f, scope: providerFolder(providerId, f.role!) }));
  if (scopes.length === 0) return;

  // Graph's delta is per-folder, so keeping N folders fresh is N reads — unless the driver can batch
  // them into one. Gmail needs no such thing: its single history read already covers every folder.
  let byFolder: Record<string, FolderChanges> = {};
  try {
    if (driver.listChangesMany && scopes.length > 1) {
      byFolder = await driver.listChangesMany(
        scopes.map(({ folder }) => ({ folderId: folder.id, cursor: folder.deltaCursor ?? null })),
      );
    } else {
      for (const { folder, scope } of scopes) {
        byFolder[folder.id] = await driver.listChanges!(
          scope === null ? null : folder.id,
          folder.deltaCursor ?? null,
        );
      }
    }
  } catch (e) {
    console.warn('pollChanges failed', e);
    return;
  }

  let changed = false;

  for (const { folder, scope } of scopes) {
    const changes = byFolder[folder.id];
    if (!changes) continue;

    try {
      if (changes.resyncRequired) {
        await setFolderDeltaCursor(db, folder.id, null);
        const full = scope ?? inboxScope;
        await syncFolder(db, full);
        lastRevalidate.set(full, Date.now());
        changed = true;
        continue;
      }

      for (const t of changes.threads) {
        t.labelIds = withMirrorLabels(providerId, t.labelIds, scope ?? undefined);
      }
      await hydrateThreads(db, changes.threads, {
        replaceLabels: authoritativeLabels(providerId),
      });
      await deleteMessagesByIds(db, changes.removedMessageIds);
      await setFolderDeltaCursor(db, folder.id, changes.cursor);
      await markFolderSynced(db, providerId, scope ?? inboxScope, changes.cursor);

      // Stops the emit below from re-entering listThreads and firing a redundant full sync.
      lastRevalidate.set(scope ?? inboxScope, Date.now());

      if (changes.threads.length || changes.removedMessageIds.length) changed = true;
    } catch (e) {
      console.warn(`pollChanges(${folder.role}) failed`, e);
    }
  }

  if (changed) emitMirrorChanged();
}

export interface SenderGroup {
  email: string;
  name: string | null;
  threadCount: number;
}
export interface DomainGroup {
  domain: string;
  threadCount: number;
  senders: SenderGroup[];
}
export interface GroupInput {
  folder?: string;
  labelIds?: string[];
}

async function foldFolderSenders(input: GroupInput | undefined): Promise<SenderGroup[]> {
  const providerId = getActiveProvider()!.provider;
  const db = await getLocalDB();
  const folderId = providerFolder(providerId, input?.folder);
  const rows = await getFolderThreadSenders(db, folderId, {
    providerId,
    labelIds: input?.labelIds ?? [],
  });

  const byEmail = new Map<string, SenderGroup>();
  for (const r of rows) {
    const email = r.latestSender?.email?.trim().toLowerCase();
    if (!email) continue;
    const cur = byEmail.get(email);
    if (cur) cur.threadCount++;
    else byEmail.set(email, { email, name: r.latestSender?.name?.trim() || null, threadCount: 1 });
  }
  return [...byEmail.values()].sort((a, b) => b.threadCount - a.threadCount);
}

export async function listSenders(input?: GroupInput): Promise<SenderGroup[]> {
  return foldFolderSenders(input);
}

export async function listDomains(input?: GroupInput): Promise<DomainGroup[]> {
  const senders = await foldFolderSenders(input);
  const byDomain = new Map<string, DomainGroup>();
  for (const s of senders) {
    const domain = s.email.slice(s.email.indexOf('@') + 1);
    let group = byDomain.get(domain);
    if (!group) {
      group = { domain, threadCount: 0, senders: [] };
      byDomain.set(domain, group);
    }
    group.threadCount += s.threadCount;
    group.senders.push(s);
  }
  return [...byDomain.values()].sort((a, b) => b.threadCount - a.threadCount);
}

export const localResolvers: Record<string, (input: any) => Promise<any>> = {
  'mail.listDomains': async (input) => listDomains(input),
  'mail.listSenders': async (input) => listSenders(input),

  // SQLite is the read path. Cold (nothing mirrored) blocks on the provider because there's nothing
  // to show; warm serves SQLite immediately and refreshes behind the response. The cursor is a
  // SQLite date cursor, not a provider page token, so paging never touches the network.
  'mail.listThreads': async (input) => {
    const providerId = getActiveProvider()!.provider;
    const db = await getLocalDB();
    const cursor: string | undefined = input?.cursor || undefined;

    const folder = (input?.folder ?? '').toLowerCase();

    // Drafts come from the outbox, not the mirror: a Gmail draft id is not a thread id, and a draft
    // the user has only typed locally has no provider id at all. The row ids here are what the list
    // hands to drafts.get.
    if (folder === 'draft' || folder === 'drafts') {
      const local = await listOutboxDrafts(db, providerId, PAGE_SIZE);
      await refreshDrafts(db, PAGE_SIZE, local.length === 0);
      const rows = local.length ? local : await listOutboxDrafts(db, providerId, PAGE_SIZE);
      return { threads: rows.map((r) => ({ id: r.id, historyId: null })), nextPageToken: null };
    }

    // Snooze is local-only (SNOOZED label); read the mirror directly, never sync.
    const isSnoozed = folder === 'snoozed';
    const folderId = isSnoozed ? 'SNOOZED' : providerFolder(providerId, input?.folder);
    const labelIds: string[] = input?.labelIds ?? [];

    const read = () =>
      findThreadsByFolderWithPagination(db, folderId, {
        pageToken: cursor,
        maxResults: PAGE_SIZE,
        providerId,
        labelIds,
        senderEmail: input?.senderEmail,
        domain: input?.domain,
      });

    const toPage = (page: Awaited<ReturnType<typeof read>>) => ({
      threads: page.threads.map((t) => ({ id: t.id, historyId: null })),
      nextPageToken: page.nextPageToken,
    });

    // Search. Both providers search the whole mailbox, so this ignores the folder. Results are
    // mirrored, then read back from SQLite — which is also what makes search work offline.
    const q = (input?.q ?? '').trim();
    if (q && !isSnoozed) {
      const readSearch = () =>
        searchThreads(db, { searchText: q, maxResults: PAGE_SIZE, providerId, pageToken: cursor });

      const cached = await readSearch();
      if (isOffline()) return toPage(cached);

      const key = `search:${q}`;

      // Scrolling the results: the mirror is dry but the provider may have more hits.
      if (cursor) {
        if (cached.threads.length > 0) return toPage(cached);
        await dedupe(`page:${key}`, () => syncNextSearchPage(db, q));
        return toPage(await readSearch());
      }

      if (Date.now() - (lastRevalidate.get(key) ?? 0) >= REVALIDATE_MS) {
        lastRevalidate.set(key, Date.now());
        await dedupe(key, () => syncSearch(db, q));
      }
      return toPage(await readSearch());
    }

    if (isSnoozed) return toPage(await read());

    // Scrolling. The mirror is the source, but when it runs dry the provider may still have older
    // mail — pull the next provider page and re-read rather than reporting the end of the folder.
    if (cursor) {
      const page = await read();
      if (page.threads.length > 0 || isOffline()) return toPage(page);
      await dedupe(`page:${folderId}`, () => syncNextPage(db, folderId).then(() => undefined));
      return toPage(await read());
    }

    // A selected label's threads may not be in the folder page we mirrored, so fetch by label.
    const scopes = labelIds.length ? labelIds : [folderId];
    const cached = await read();

    if (isOffline()) return toPage(cached);

    // Cold: nothing mirrored, so there is nothing to show until the provider answers. A folder that
    // is genuinely empty stays cold, so this is rate-limited too — otherwise it re-syncs per mount.
    if (cached.threads.length === 0) {
      const key = scopes.join('|');
      if (Date.now() - (lastRevalidate.get(key) ?? 0) >= REVALIDATE_MS) {
        lastRevalidate.set(key, Date.now());
        await syncScopes(db, scopes);
      }
      return toPage(await read());
    }

    // Warm: opening a folder always refreshes it. Serve the mirror now; the sync lands behind the
    // response and emitMirrorChanged re-reads. `dedupe` collapses repeat opens of the same scope.
    revalidateScopes(db, scopes);
    return toPage(cached);
  },

  // mail-list calls this once per visible row, so it must not touch the network: rows render off the
  // body-less stub syncFolder mirrored. Only the open thread — the one in ?threadId — is fetched.
  'mail.get': async (input) => {
    const db = await getLocalDB();

    const render = async () => {
      const rows = await getThreadMessages(db, input.id);
      const labels = await getThreadLabels(db, input.id);
      const thread = await get(db, { id: input.id });
      const messages = await Promise.all(
        rows.map(async (m) => toParsedMessage(m, await getMessageAttachments(db, m.id), labels)),
      );
      return toThreadResponse(messages, labels, thread?.replyCount);
    };

    const cached = await getThreadMessages(db, input.id);

    if (isOffline() || !isOpenThread(input.id)) return render();

    if (cached.length === 0) {
      await syncThread(db, input.id);
      return render();
    }

    if (await threadStale(db, input.id, Date.now())) {
      void dedupe(`thread:${input.id}`, async () => {
        try {
          await syncThread(db, input.id);
          emitMirrorChanged();
        } catch (e) {
          console.warn(`syncThread(${input.id}) failed, serving mirror`, e);
        }
      });
    }

    return render();
  },

  // Read/star/important are Gmail system labels: modifyLabels at the provider + a local threadLabels update.
  'mail.markAsRead': async (input) => {
    await Promise.all((input?.ids ?? []).map((id: string) => modifyThread(id, [], ['UNREAD'])));
    return { success: true };
  },

  'mail.markAsUnread': async (input) => {
    await Promise.all((input?.ids ?? []).map((id: string) => modifyThread(id, ['UNREAD'], [])));
    return { success: true };
  },

  'mail.toggleStar': async (input) => {
    await Promise.all((input?.ids ?? []).map((id: string) => toggleLabel(id, 'STARRED')));
    return { success: true };
  },

  'mail.toggleImportant': async (input) => {
    await Promise.all((input?.ids ?? []).map((id: string) => toggleLabel(id, 'IMPORTANT')));
    return { success: true };
  },

  'mail.modifyLabels': async (input) => {
    const ids: string[] = Array.isArray(input?.threadId) ? input.threadId : [input?.threadId];
    await Promise.all(
      ids.filter(Boolean).map((id) => modifyThread(id, input?.addLabels ?? [], input?.removeLabels ?? [])),
    );
    return { success: true };
  },

  // Queued, not sent: the row lands in the outbox and ./outbox drains it. Returns immediately, so a
  // send with no network succeeds and goes out when one comes back.
  'mail.send': async (input) => {
    const db = await getLocalDB();
    const payload = toOutboxPayload(input);

    // The undo window is what makes unsend possible at all — there is nothing to recall once the
    // provider has the message. Scheduling a send is the same mechanism with a longer wait.
    const scheduled = input?.scheduleAt ? Date.parse(input.scheduleAt) : NaN;
    const undoMs = store.getSettings().undoSendEnabled ? UNDO_SEND_MS : 0;
    const sendAfter = Number.isFinite(scheduled) ? scheduled : Date.now() + undoMs;

    const id = await queueSend(db, {
      draftId: input?.draftId ?? null,
      threadId: input?.threadId ?? null,
      payload,
      sendAfter,
    });

    scheduleFlush(sendAfter - Date.now());

    // `queued`/`messageId`/`sendAt` is the shape useUndoSend reads; the rest keeps older callers happy.
    return {
      queued: true as const,
      messageId: id,
      sendAt: sendAfter,
      success: true,
      id,
      threadId: input?.threadId ?? null,
    };
  },

  // Undo send: pull the row back before the flusher claims it. Past that, the provider has it.
  'mail.unsend': async (input) => {
    const db = await getLocalDB();
    const id: string = input?.messageId ?? input?.id;
    const cancelled = id ? await cancelSend(db, id) : false;
    if (!cancelled) throw new Error('Message has already been sent');
    return { success: true };
  },

  // Delete = trash at the provider (Outlook moves it to Deleted Items), then drop the mirror row. The
  // thread now lives in the bin, which the mirror has never seen — invalidate so the bin re-pulls it
  // instead of showing a stale folder that the deleted mail never arrives in.
  'mail.delete': async (input) => {
    const driver = getActiveDriver();
    const db = await getLocalDB();
    await driver.trashThread(input.id);
    await del(db, { id: input.id });
    await invalidateAllFolders(db);
    emitMirrorChanged();
    return true;
  },

  'mail.bulkDelete': async (input) => {
    const driver = getActiveDriver();
    const db = await getLocalDB();
    await Promise.all(
      (input?.ids ?? []).map(async (id: string) => {
        await driver.trashThread(id);
        await del(db, { id });
      }),
    );
    await invalidateAllFolders(db);
    emitMirrorChanged();
    return { success: true };
  },

  // Drafts are local-first: written to the outbox and returned. The composer autosaves on a timer,
  // so this is on the typing path — it must not wait for the provider. ./outbox pushes it up after.
  'drafts.create': async (input) => {
    const db = await getLocalDB();
    const id = await saveDraft(db, {
      id: input?.id ?? null,
      threadId: input?.threadId ?? null,
      payload: toOutboxPayload(input),
    });
    scheduleFlush(0);
    return { id, success: true };
  },

  'drafts.get': async (input) => {
    const db = await getLocalDB();
    const row = await getOutbox(db, input.id);

    // A draft the mirror hasn't pulled yet (opened straight from a link, say) still has to render.
    if (!row) {
      if (isOffline()) throw new Error('Draft not available offline');
      return getActiveDriver().getDraft(input.id);
    }

    return {
      id: row.id,
      to: row.payload.to,
      cc: row.payload.cc ?? [],
      bcc: row.payload.bcc ?? [],
      subject: row.payload.subject,
      content: row.payload.html,
      rawAttachments: row.payload.attachments ?? [],
    };
  },

  'drafts.list': async (input) => {
    const db = await getLocalDB();
    const providerId = getActiveProvider()!.provider;
    const maxResults: number = input?.maxResults ?? PAGE_SIZE;

    const local = await listOutboxDrafts(db, providerId, maxResults);
    await refreshDrafts(db, maxResults, local.length === 0);
    const rows = local.length ? local : await listOutboxDrafts(db, providerId, maxResults);
    return { threads: rows.map((r) => ({ id: r.id, historyId: null })), nextPageToken: null };
  },

  'drafts.delete': async (input) => {
    const db = await getLocalDB();
    await discardDraft(db, input.id);
    scheduleFlush(0);
    return true;
  },

  'mail.getEmailAliases': async () => {
    const driver = getActiveDriver();
    return driver.getEmailAliases();
  },

  // Force-sync = drop every TTL so the next read re-pulls from the provider.
  'mail.forceSync': async () => {
    const db = await getLocalDB();
    await resetSyncState(db);
    return { success: true };
  },

  // Snooze is local-only: a SNOOZED label, out of the inbox. pollChanges wakes them.
  'mail.snoozeThreads': async (input) => {
    if (!input?.ids?.length) return { success: false, error: 'No thread IDs provided' };
    const db = await getLocalDB();
    const providerId = getActiveProvider()!.provider;
    const inbox = providerFolder(providerId, 'inbox');
    const wakeAt = input.wakeAt ?? new Date().toISOString();

    await Promise.all(
      input.ids.map(async (id: string) => {
        await applyThreadLabels(db, id, ['SNOOZED'], [inbox]);
        await setSnooze(db, providerId, id, wakeAt);
      }),
    );
    return { success: true };
  },

  'mail.unsnoozeThreads': async (input) => {
    if (!input?.ids?.length) return { success: false, error: 'No thread IDs' };
    const db = await getLocalDB();
    const inbox = providerFolder(getActiveProvider()!.provider, 'inbox');

    await Promise.all(
      input.ids.map(async (id: string) => {
        await applyThreadLabels(db, id, [inbox], ['SNOOZED']);
        await clearSnooze(db, id);
      }),
    );
    return { success: true };
  },

  // Sanitize the provider HTML and pass it through (image-blocking/theming later).
  'mail.processEmailContent': async (input) => {
    const html = typeof input?.html === 'string' ? input.html : '';
    return { processedHtml: DOMPurify.sanitize(html), hasBlockedImages: false };
  },

  // UI renders attachments as data URLs. Bytes are cached in the mirror on first fetch, so
  // reopening one — offline included — never hits the provider again.
  'mail.getMessageAttachments': async (input) => {
    const db = await getLocalDB();
    const messageId: string = input.messageId ?? input.id;
    const atts = await getMessageAttachments(db, messageId);
    return Promise.all(
      atts.map(async (a) => {
        let body = (await getAttachmentBody(db, messageId, a.attachmentId)) ?? '';
        if (!body && a.attachmentId && !isOffline()) {
          try {
            const blob = await getActiveDriver().getAttachment(messageId, a.attachmentId);
            body = bytesToBase64(blob.bytes);
            // Graph returns no contentBytes for item/reference attachments — caching '' would just
            // read back as a miss forever.
            if (blob.bytes.length > 0 && blob.bytes.length <= ATTACHMENT_CACHE_MAX_BYTES) {
              await setAttachmentBody(db, messageId, a.attachmentId, body);
            }
          } catch (e) {
            // Leave empty — the row still shows, just no preview/download.
            console.warn(`getAttachment(${a.attachmentId}) failed`, e);
          }
        }
        return {
          attachmentId: a.attachmentId,
          filename: a.filename ?? '',
          mimeType: a.mimeType ?? '',
          size: a.size ?? 0,
          body,
          headers: [],
        };
      }),
    );
  },

  // Served from the `folders` table; the provider is hit only when the tree is absent or stale.
  'labels.list': async () => {
    const db = await getLocalDB();
    const providerId = getActiveProvider()!.provider;

    let rows = await getFolders(db, providerId);
    const needsTree = rows.length === 0 || (await folderStale(db, TREE_SCOPE, Date.now()));
    if (needsTree && !isOffline()) {
      try {
        await syncFolderTree(db);
        rows = await getFolders(db, providerId);
      } catch (e) {
        // Serve the mirror rather than blank the sidebar on a transient provider failure.
        console.warn('syncFolderTree failed, serving mirror', e);
      }
    }

    const byParent = new Map<string | null, Folder[]>();
    for (const f of rows) {
      const siblings = byParent.get(f.parentId ?? null) ?? [];
      siblings.push(f);
      byParent.set(f.parentId ?? null, siblings);
    }

    // Role folders are 'system' so they don't duplicate the static nav (Inbox/Sent/Archive/…), but
    // they stay in the payload with `role` set — the nav hangs their user subfolders off them.
    const toLabel = (f: Folder): any => {
      const children = byParent.get(f.id) ?? [];
      return {
        id: f.id,
        name: f.name,
        color: undefined,
        type: f.role ? 'system' : 'user',
        role: f.role ?? null,
        unread: f.unread ?? 0,
        total: f.total ?? 0,
        labels: children.length ? children.map(toLabel) : undefined,
      };
    };

    return (byParent.get(null) ?? []).map(toLabel);
  },

  // Each mutates the tree at the provider, so the mirror's copy is stale the moment the call returns
  // — re-read the tree here rather than leaving it to whenever something next asks for it.
  'labels.create': async (input) => {
    const res = await getActiveDriver().createLabel({ name: input?.name, color: input?.color });
    await refreshFolderTree();
    return res;
  },

  'labels.update': async (input) => {
    const res = await getActiveDriver().updateLabel(input.id, {
      name: input?.name,
      color: input?.color,
    });
    await refreshFolderTree();
    return res;
  },

  'labels.delete': async (input) => {
    await getActiveDriver().deleteLabel(input.id);
    await refreshFolderTree();
    return { success: true };
  },

  // Shape must match the server: { connections, disconnectedIds } — NavUser reads .connections.
  'connections.list': async () => {
    const p = getActiveProvider();
    if (!p) return { connections: [], disconnectedIds: [] };
    const email = p.getEmail() ?? '';
    return {
      connections: [
        { id: 'local', email, name: email, picture: null, createdAt: null, providerId: p.provider },
      ],
      disconnectedIds: [],
    };
  },

  // Backend/AI stubs — no local equivalent; return benign shapes to avoid failed network calls.
  'ai.compose': async () => ({ newBody: '' }),
  'ai.generateEmailSubject': async () => ({ subject: '' }),
  'ai.generateSearchQuery': async () => ({ query: '' }),
  'ai.webSearch': async () => ({ sources: [] }),
  'brain.getLabels': async () => [],
  'brain.updateLabels': async () => ({ success: true }),
  'brain.enableBrain': async () => ({ success: true }),
  'brain.disableBrain': async () => ({ success: true }),
  'brain.getPrompts': async () => [],
  'brain.updatePrompt': async () => ({ success: true }),
  // AiSummary reads summary.data.short — return {data:{...}} so it renders nothing.
  'brain.generateSummary': async () => ({ data: { short: '', long: '' } }),
  'brain.getState': async () => ({ enabled: false }),
  'meet.create': async () => null,
  'user.getIntercomToken': async () => null,
  'bimi.getByEmail': async () => null,
  'mail.verifyEmail': async () => ({ verified: false }),
  'mail.suggestRecipients': async () => [],
  'cookiePreferences.setLocaleCookie': async () => ({ success: true }),

  'connections.getDefault': async () => {
    const p = getActiveProvider();
    if (!p) return null;
    const email = p.getEmail() ?? '';
    return { id: 'local', email, name: email, picture: null, providerId: p.provider };
  },

  // Browser-only user data (settings/templates/notes) in localStorage. See ./local-store.
  'settings.get': async () => ({ settings: store.getSettings() }),

  'settings.save': async (input) => {
    const settings = store.saveSettings(input ?? {});
    return { success: true, settings };
  },

  'templates.list': async () => ({ templates: store.listTemplates() }),

  'templates.create': async (input) => {
    const template = store.createTemplate(
      {
        name: input?.name ?? '',
        subject: input?.subject ?? '',
        body: input?.body ?? '',
        to: input?.to,
        cc: input?.cc,
        bcc: input?.bcc,
      },
      new Date().toISOString(),
    );
    return { template };
  },

  'templates.delete': async (input) => {
    store.deleteTemplate(input.id);
    return { success: true };
  },

  'notes.list': async (input) => ({ notes: store.getThreadNotes(input.threadId) }),

  'notes.create': async (input) => {
    const note = store.createNote(
      {
        threadId: input.threadId,
        content: input?.content ?? '',
        color: input?.color ?? 'default',
        isPinned: input?.isPinned ?? false,
      },
      new Date().toISOString(),
    );
    return { note };
  },

  'notes.update': async (input) => {
    const note = store.updateNote(input.noteId, input?.data ?? {}, new Date().toISOString());
    return { note };
  },

  'notes.delete': async (input) => ({ success: store.deleteNote(input.noteId) }),

  'notes.reorder': async (input) => ({ success: store.reorderNotes(input?.notes ?? []) }),

  // One connection in local mode — nothing to switch; no-op.
  'connections.setDefault': async () => ({ success: true }),

  // Disconnect the account: revoke, wipe the mirror, clear flags, fall back to login.
  'connections.delete': async () => {
    await localSignOut();
    return { success: true };
  },

  // No server account exists in local mode, so "delete account" is: revoke the token and destroy
  // every trace on this device — the mirror, the caches, and the settings/templates/notes that
  // sign-out deliberately keeps.
  'user.delete': async () => {
    store.clearAll();
    await localSignOut();
    return { success: true, message: '' };
  },
};
