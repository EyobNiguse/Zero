import {
  hydrateMessages,
  hydrateThreads,
  getThreadLabels,
  applyThreadLabels,
  getFolderThreadSenders,
  pruneFolderMembership,
  replaceFolders,
  getFolders,
  setFolderDeltaCursor,
  deleteMessagesByIds,
  pruneThreadMessages,
  type OutboxPayload,
} from '../db';
import type { LocalDB } from '../db';
import { getActiveClient, getActiveDriver, getTokenProvider, getLocalDB } from './bridge';
import type { FolderChanges, NormalizedThread } from '../mail/types';
import type { GmailClient } from '../mail/gmail-client';
import type { GraphClient } from '../mail/graph-client';
import { hydrateStubs, PAGE_SIZE, withRetry } from './hydrate';
import { codec } from './codecs';
import * as googleCodec from './codecs/google';
import * as microsoftCodec from './codecs/microsoft';
import {
  markFolderSynced,
  markThreadSynced,
  getPageCursor,
  setPageCursor,
  clearSnooze,
  dueSnoozes,
  invalidateAllFolders,
  TREE_SCOPE,
} from './sync-state';
import { dedupe, emitMirrorChanged, withTabLock } from './dedupe';
import { flushOutbox, syncDrafts } from './outbox';

export { PAGE_SIZE } from './hydrate';

// Bigger attachments are still served, just never persisted — one 40MB video would bloat the OPFS
// file (and base64 costs another third on top) for a file that is usually opened once.
export const ATTACHMENT_CACHE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Write a batch of threads into the mirror under the signed-in provider's label rules.
 * `listedUnder` is the folder they were read from, where the response carries no folder of its own.
 */
export async function mirrorThreads(
  db: LocalDB,
  threads: NormalizedThread[],
  listedUnder?: string,
): Promise<void> {
  const c = codec();
  for (const t of threads) t.labelIds = c.mirrorLabels(t.labelIds, listedUnder);
  await hydrateThreads(db, threads, { replaceLabels: c.replaceLabels });
}

/** Pull one provider page of a folder into the mirror. Returns the token for the page after it. */
export async function syncThreadPage(
  db: LocalDB,
  key: string,
  pageToken?: string,
): Promise<string | null> {
  const c = codec();
  // Archive is not a Gmail label but "filed nowhere else", so it is fetched as a search.
  const selector =
    c.id === 'google' && key === 'archive' ? { q: 'in:archive' } : { labelId: key };

  const page = await withRetry(() =>
    getActiveDriver().listThreads({
      ...selector,
      maxResults: PAGE_SIZE,
      ...(pageToken ? { pageToken } : {}),
    }),
  );

  await mirrorThreads(db, page.threads, key);
  await hydrateStubs(db, page.threads);

  // Graph never reports a thread's whole folder set, so absence from the newest page is the only
  // signal a thread has left this folder. Gmail's listing is complete, so nothing is pruned there.
  if (c.id === 'microsoft' && !pageToken) {
    const dates = page.threads
      .map((t) => t.thread.latestReceivedOn)
      .filter((d): d is string => d != null);
    if (dates.length > 0) {
      const since = dates.reduce((a, b) => (a < b ? a : b));
      const ids = page.threads.map((t) => t.thread.id);
      await pruneFolderMembership(db, key, ids, since);
    }
  }

  await setPageCursor(db, c.id, key, page.nextPageToken);
  return page.nextPageToken;
}

/** Pull the latest page of a folder from the provider into the SQLite mirror. */
export async function syncFolder(db: LocalDB, folderId: string): Promise<void> {
  await syncThreadPage(db, folderId);
  await markFolderSynced(db, codec().id, folderId);
}

/** Mirror the provider's hits for a search term. Failure is non-fatal — the mirror still answers. */
export async function syncSearch(db: LocalDB, q: string, pageToken?: string): Promise<void> {
  const c = codec();
  try {
    const page = await withRetry(() =>
      getActiveDriver().listThreads({
        q,
        maxResults: PAGE_SIZE,
        ...(pageToken ? { pageToken } : {}),
      }),
    );

    // No listedUnder and no prune: a hit keeps the labels the provider gave it — it is a real thread
    // in a real folder, not a member of some synthetic "search" folder, and a search spans them all.
    await mirrorThreads(db, page.threads);
    await hydrateStubs(db, page.threads);
    // Paged under the query itself, so scrolling a search pulls the next page of hits.
    await setPageCursor(db, c.id, `search:${q}`, page.nextPageToken);
  } catch (e) {
    console.warn(`search(${q}) failed, serving mirror`, e);
  }
}

export async function syncNextSearchPage(db: LocalDB, q: string): Promise<void> {
  const pageToken = await getPageCursor(db, `search:${q}`);
  if (!pageToken) return;
  await syncSearch(db, q, pageToken);
}

/**
 * The mirror ran out of threads but the provider has more — pull the next provider page.
 * Returns false when the folder is fully mirrored.
 */
export async function syncNextPage(db: LocalDB, folderId: string): Promise<boolean> {
  const pageToken = await getPageCursor(db, folderId);
  if (!pageToken) return false;
  await syncThreadPage(db, folderId, pageToken);
  return true;
}

/** Pull one thread's full contents from the provider into the SQLite mirror. */
export async function syncThread(db: LocalDB, threadId: string): Promise<void> {
  const driver = getActiveDriver();
  const providerId = getTokenProvider()!.provider;
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


export async function syncFolderTree(db: LocalDB): Promise<void> {
  const c = codec();
  // The one read whose shape the driver has no reason to normalize — a folder tree only ever
  // becomes mirror rows, so each codec maps its own provider's listing straight to them.
  const rows = await withRetry(async () =>
    c.id === 'microsoft'
      ? microsoftCodec.toFolderRows(
          (await (getActiveClient() as GraphClient).getFolderIndex()).roots,
        )
      : googleCodec.toFolderRows(await (getActiveClient() as GmailClient).listLabels()),
  );
  await replaceFolders(db, c.id, rows, new Date().toISOString());
  await markFolderSynced(db, c.id, TREE_SCOPE);
}

/** Apply a label change to one thread: provider first, then the local mirror. */
export async function modifyThread(threadId: string, add: string[], remove: string[]): Promise<void> {
  const db = await getLocalDB();
  await getActiveDriver().modifyLabels(threadId, add, remove);

  // Record what the provider has already accepted, in the mirror's own terms. `folderMove` is the
  // signal to re-read: Graph re-ids every message in a thread it moves.
  const edit = codec().mirrorEdit(add, remove);
  await applyThreadLabels(db, threadId, edit.add, edit.remove);
  const moved = edit.folderMove;

  // A folder move can re-key the thread's messages at the provider, so re-read it rather than trust
  // the label edit above. Behind the response — the edit is enough for the list.
  await afterThreadWrite(db, threadId, moved);
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
export async function toggleLabel(threadId: string, label: string): Promise<void> {
  const db = await getLocalDB();
  const has = (await getThreadLabels(db, threadId)).some((l) => l.name === label);
  await modifyThread(threadId, has ? [] : [label], has ? [label] : []);
}

/** Pull every target (a folder, or each selected label) into the mirror. */
export async function syncTargets(db: LocalDB, targets: string[]): Promise<void> {
  for (const target of targets) {
    try {
      await syncFolder(db, target);
    } catch (e) {
      console.warn(`syncFolder(${target}) failed, serving mirror`, e);
    }
  }
}

const REVALIDATE_MS = 5_000;
const lastRevalidate = new Map<string, number>();


export function claimRevalidate(key: string): boolean {
  const now = Date.now();
  if (now - (lastRevalidate.get(key) ?? 0) < REVALIDATE_MS) return false;
  lastRevalidate.set(key, now);
  return true;
}

/** Stamp a target as just-refreshed without asking — stops an emit from re-entering the resolver. */
export function markRevalidated(key: string): void {
  lastRevalidate.set(key, Date.now());
}

/** Refresh behind an already-served response, then tell the UI to re-read. */
export function revalidateTargets(db: LocalDB, targets: string[]): void {
  const key = targets.join('|');
  if (!claimRevalidate(key)) return;

  void dedupe(key, async () => {
    await syncTargets(db, targets);
    emitMirrorChanged();
  });
}

/** No network: the mirror is the only source. Skips a sync that would just time out. */
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** How long a queued send sits before the flusher takes it — the window `mail.unsend` recalls it in. */
export const UNDO_SEND_MS = 15_000;

/** Nudge the flusher when the wait is short. Anything further out is picked up by the poll tick. */
export function scheduleFlush(delayMs: number): void {
  if (delayMs > 60_000) return;
  setTimeout(() => void flushOutbox(), Math.max(0, delayMs) + 250);
}

/** Normalize the compose payloads (send sends objects, draft-save sends comma-joined strings). */
export function toOutboxPayload(input: any): OutboxPayload {
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
export async function refreshFolderTree(): Promise<void> {
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
export async function refreshDrafts(db: LocalDB, maxResults: number, blocking: boolean): Promise<void> {
  if (isOffline()) return;
  if (!claimRevalidate('drafts')) return;

  const run = dedupe('drafts', async () => {
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
export function isOpenThread(id: string): boolean {
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

export function pollChanges(): Promise<void> {
  // Tabs share one mirror, so a second poller is duplicate API calls and two writers racing the same
  // delta cursors. One tab per tick is enough; the others pick up the result through the shared db.
  return withTabLock('zero-poll', pollChangesLocked);
}

async function pollChangesLocked(): Promise<void> {
  if (!getTokenProvider()) return;

  const c = codec();
  const db = await getLocalDB();
  const inboxFolder = c.folderKey('inbox');

  // Snoozes are local, so they wake with or without a network.
  const woke = await wakeSnoozed(db, inboxFolder);
  if (woke) emitMirrorChanged();

  if (isOffline()) return;
  const driver = getActiveDriver();
  const polled = c.pollTargets(await getFolders(db, c.id));
  if (polled.length === 0) return;

  // Graph's delta is per-folder, so keeping N folders fresh is N reads — unless the driver can batch
  // them into one. Gmail needs no such thing: its single history read already covers every folder.
  let byFolder: Record<string, FolderChanges> = {};
  try {
    if (driver.listChangesMany && polled.length > 1) {
      byFolder = await driver.listChangesMany(
        polled.map(({ folder }) => ({ folderId: folder.id, cursor: folder.deltaCursor ?? null })),
      );
    } else {
      for (const { folder, folderKey } of polled) {
        byFolder[folder.id] = await driver.listChanges!(
          folderKey === null ? null : folder.id,
          folder.deltaCursor ?? null,
        );
      }
    }
  } catch (e) {
    console.warn('pollChanges failed', e);
    return;
  }

  let changed = false;

  for (const { folder, folderKey } of polled) {
    const changes = byFolder[folder.id];
    if (!changes) continue;

    try {
      if (changes.resyncRequired) {
        await setFolderDeltaCursor(db, folder.id, null);
        const full = folderKey ?? inboxFolder;
        await syncFolder(db, full);
        markRevalidated(full);
        changed = true;
        continue;
      }

      await mirrorThreads(db, changes.threads, folderKey ?? undefined);
      await deleteMessagesByIds(db, changes.removedMessageIds);
      await setFolderDeltaCursor(db, folder.id, changes.cursor);
      await markFolderSynced(db, c.id, folderKey ?? inboxFolder, changes.cursor);

      // Stops the emit below from re-entering listThreads and firing a redundant full sync.
      markRevalidated(folderKey ?? inboxFolder);

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
  const c = codec();
  const db = await getLocalDB();
  const rows = await getFolderThreadSenders(db, c.folderKey(input?.folder), {
    providerId: c.id,
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
