// The write half of local mode. Every user write — a draft edit, a send — lands in the `outbox`
// table first and the resolver returns; this module reconciles those rows with the provider in the
// background. That is what makes composing, saving and sending work with no network.
import {
  getLocalDB,
  upsertOutbox,
  updateOutbox,
  deleteOutbox,
  getOutbox,
  dueSends,
  stalledSends,
  pendingDraftWrites,
  outboxRemoteIds,
  pruneRemoteDrafts,
  hydrateThreads,
  hydrateMessages,
  hydrateMessageStubs,
  del,
  type LocalDB,
  type OutboxRow,
  type OutboxPayload,
} from '../db';
import { getActiveDriver, getTokenProvider, isLocalActive } from './bridge';
import { codec } from './codecs';
import type { ProviderId } from '../auth';
import { invalidateAllFolders, markFolderSynced, markThreadSynced } from './sync-state';
import { dedupe, emitMirrorChanged, withTabLock } from './dedupe';
import { toast } from 'sonner';

/** A send that keeps failing is parked as a draft rather than retried forever — a timeout after the
 * provider already accepted it would send twice. */
const MAX_SEND_ATTEMPTS = 3;
const BACKOFF_MS = [0, 30_000, 2 * 60_000];
/** A row still 'sending' this long after it was claimed belongs to a tab that is gone. */
const STALLED_SEND_MS = 2 * 60_000;

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Where a sent message lands in the mirror. */
const sentFolder = (): string => codec().folderKey('sent');

// --- writes from the resolvers -----------------------------------------------

export interface DraftInput {
  id?: string | null;
  threadId?: string | null;
  payload: OutboxPayload;
}

/** Save a draft locally. Returns the id the composer should keep using. */
export async function saveDraft(db: LocalDB, input: DraftInput): Promise<string> {
  const providerId = getTokenProvider()!.provider;
  const existing = input.id ? await getOutbox(db, input.id) : null;
  const id = existing?.id ?? input.id ?? crypto.randomUUID();

  await upsertOutbox(db, {
    id,
    providerId,
    kind: 'draft',
    status: 'draft',
    remoteId: existing?.remoteId ?? null,
    threadId: input.threadId ?? existing?.threadId ?? null,
    payload: input.payload,
    dirty: true,
    attempts: 0,
    lastError: null,
    sendAfter: null,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  });

  emitMirrorChanged();
  return id;
}

/** Queue a send. `sendAfter` is the undo window (or the user's schedule) — the flusher waits it out. */
export async function queueSend(
  db: LocalDB,
  input: { draftId?: string | null; threadId?: string | null; payload: OutboxPayload; sendAfter: number },
): Promise<string> {
  const providerId = getTokenProvider()!.provider;
  // Reuse the draft's row: sending it must not leave the draft behind in the folder.
  const draft = input.draftId ? await getOutbox(db, input.draftId) : null;
  const id = draft?.id ?? crypto.randomUUID();

  await upsertOutbox(db, {
    id,
    providerId,
    kind: 'send',
    status: 'queued',
    remoteId: draft?.remoteId ?? null,
    threadId: input.threadId ?? draft?.threadId ?? null,
    payload: input.payload,
    dirty: true,
    attempts: 0,
    lastError: null,
    sendAfter: input.sendAfter,
    createdAt: draft?.createdAt ?? now(),
    updatedAt: now(),
  });

  await mirrorPendingSend(db, providerId, id, input.payload);
  emitMirrorChanged();
  return id;
}

/** Undo-send. Only a row the flusher hasn't claimed can be pulled back. */
export async function cancelSend(db: LocalDB, id: string): Promise<boolean> {
  const row = await getOutbox(db, id);
  if (!row || row.kind !== 'send' || row.status !== 'queued') return false;

  await deleteOutbox(db, row.id);
  await del(db, { id: row.id });
  emitMirrorChanged();
  return true;
}

/** Drop a draft. The provider copy (if any) is deleted by the flusher. */
export async function discardDraft(db: LocalDB, id: string): Promise<void> {
  const row = await getOutbox(db, id);
  if (!row) return;

  if (row.remoteId) {
    await updateOutbox(db, row.id, { status: 'deleting', dirty: true });
  } else {
    await deleteOutbox(db, row.id);
  }
  emitMirrorChanged();
}

/**
 * Show a queued send in Sent immediately. The row is dropped once the provider confirms — the real
 * message comes back on the next sync with the provider's own ids.
 */
async function mirrorPendingSend(
  db: LocalDB,
  providerId: ProviderId,
  id: string,
  payload: OutboxPayload,
): Promise<void> {
  const me = getTokenProvider()?.getEmail() ?? '';
  const sender = { name: payload.fromEmail ?? me, email: me };
  const timestamp = now();

  await hydrateThreads(db, [
    {
      thread: {
        id,
        threadId: id,
        providerId,
        latestSender: sender,
        latestReceivedOn: timestamp,
        latestSubject: payload.subject,
        replyCount: null,
      },
      labelIds: [sentFolder()],
    },
  ]);

  // The bytes are already in the payload, so the placeholder carries its attachments — otherwise the
  // message shows up in Sent with the paperclip gone until a thread sync fills them back in.
  const atts = (payload.attachments ?? []).map((a, i) => ({
    messageId: id,
    attachmentId: `local-${i}`,
    filename: a.filename,
    mimeType: a.mimeType,
    size: Math.floor((a.contentBase64.length * 3) / 4),
    inline: false,
    contentId: null,
    body: a.contentBase64,
  }));

  await hydrateMessages(
    db,
    [
      {
        id,
        threadId: id,
        providerId,
        sender,
        toRecipients: payload.to.map((email) => ({ email })),
        ccRecipients: (payload.cc ?? []).map((email) => ({ email })),
        subject: payload.subject,
        snippet: '',
        bodyHtml: payload.html,
        bodyText: null,
        receivedOn: timestamp,
        hasAttachments: atts.length > 0,
      },
    ],
    atts,
  );
}

/**
 * Graph answers sendMail with 202 — accepted, not sent. The message reaches Sent Items some moment
 * later, so a single read right after the send usually misses it. Poll until it lands.
 */
const SENT_POLL_MS = [0, 1_500, 4_000, 10_000, 20_000];

/** Pull the sent folder into the mirror. Returns the thread of the message we just sent, if it's there. */
async function readSentFolder(
  db: LocalDB,
  row: OutboxRow,
  sentThreadId?: string,
): Promise<string | null> {
  const providerId = getTokenProvider()!.provider;
  const folderId = sentFolder();
  const driver = getActiveDriver();

  const page = await driver.listThreads({ labelId: folderId, maxResults: 10 });
  for (const t of page.threads) {
    if (!t.labelIds.includes(folderId)) t.labelIds.push(folderId);
  }
  await hydrateThreads(db, page.threads);
  await hydrateMessageStubs(
    db,
    page.threads.map((t) => t.latestMessage).filter((m): m is NonNullable<typeof m> => m != null),
  );
  await markFolderSynced(db, providerId, folderId);

  // Gmail's send returns the thread id. Graph returns nothing, so match on what we do know.
  if (sentThreadId) return sentThreadId;
  return page.threads.find((t) => t.thread.latestSubject === row.payload.subject)?.thread.id ?? null;
}

/**
 * Swap the local copy for the provider's, once the provider actually has it. The placeholder holds
 * the body AND the attachment bytes, so it stays until the real message is mirrored in full —
 * dropping it early is what left sent mail with its attachments missing, because a folder listing
 * only yields stubs and a stub has no attachment rows.
 */
async function reconcileSent(db: LocalDB, row: OutboxRow, sentThreadId?: string): Promise<void> {
  for (const wait of SENT_POLL_MS) {
    if (wait) await sleep(wait);

    try {
      const threadId = await readSentFolder(db, row, sentThreadId);
      if (!threadId) {
        emitMirrorChanged();
        continue;
      }

      const providerId = getTokenProvider()!.provider;
      const detail = await getActiveDriver().getThread(threadId);
      await hydrateMessages(db, detail.messages, detail.attachments);
      await markThreadSynced(db, providerId, threadId);

      await del(db, { id: row.id });
      emitMirrorChanged();
      return;
    } catch (e) {
      console.warn('outbox: sent-folder reconcile failed', e);
    }
  }

  // Never showed up. Drop the placeholder anyway — it names a thread the provider has never heard of,
  // and leaving it strands a row that can't be opened. The next folder sync brings the real one in.
  console.warn(`outbox: sent copy of "${row.payload.subject}" never appeared; dropping placeholder`);
  await del(db, { id: row.id });
  await invalidateAllFolders(db);
  emitMirrorChanged();
}

// --- the flusher -------------------------------------------------------------

/**
 * Drain the queue: push draft edits, delete discarded drafts, send what's due. Deduped, so the
 * interval tick, the `online` event and a fresh send can all call it without racing each other.
 */
export function flushOutbox(): Promise<void> {
  if (!isLocalActive() || isOffline()) return Promise.resolve();
  // dedupe collapses this tab's callers; the tab lock keeps a second tab off the same rows.
  return dedupe('outbox', () => withTabLock('zero-outbox', drain));
}

async function drain(): Promise<void> {
  const db = await getLocalDB();
  let changed = false;

  // A reload mid-send leaves the row claimed forever, and the mail never goes out. Nothing else
  // clears it, so requeue what has clearly been abandoned.
  const stalledBefore = new Date(Date.now() - STALLED_SEND_MS).toISOString();
  for (const row of await stalledSends(db, stalledBefore)) {
    await updateOutbox(db, row.id, { status: 'queued' });
  }

  for (const row of await pendingDraftWrites(db)) {
    changed = (await pushDraft(db, row)) || changed;
  }

  for (const row of await dueSends(db, Date.now())) {
    changed = (await send(db, row)) || changed;
  }

  if (changed) emitMirrorChanged();
}

/** Mirror one local draft up to the provider, or delete the provider's copy of a discarded one. */
async function pushDraft(db: LocalDB, row: OutboxRow): Promise<boolean> {
  const driver = getActiveDriver();

  try {
    if (row.status === 'deleting') {
      if (row.remoteId) await driver.deleteDraft(row.remoteId);
      await deleteOutbox(db, row.id);
      return true;
    }

    const res = await driver.createDraft({
      to: row.payload.to,
      cc: row.payload.cc,
      bcc: row.payload.bcc,
      subject: row.payload.subject,
      html: row.payload.html,
      id: row.remoteId ?? undefined,
    });

    // Not `dirty: false` unconditionally — the user may have typed while this was in flight, which
    // bumped updatedAt. Clearing the flag then would strand those edits locally.
    const current = await getOutbox(db, row.id);
    const edited = current != null && current.updatedAt !== row.updatedAt;
    await updateOutbox(db, row.id, {
      remoteId: res.id || row.remoteId,
      dirty: edited,
      lastError: null,
    });
    return false;
  } catch (e) {
    // A draft that won't push is not worth surfacing — it is safe locally and the next tick retries.
    console.warn(`outbox: draft ${row.id} push failed`, e);
    await updateOutbox(db, row.id, { lastError: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

/** Send one queued row. On success the optimistic mirror row is replaced by a real sync. */
async function send(db: LocalDB, row: OutboxRow): Promise<boolean> {
  await updateOutbox(db, row.id, { status: 'sending', attempts: row.attempts + 1 });

  try {
    const result = await getActiveDriver().sendMessage({
      to: row.payload.to,
      cc: row.payload.cc,
      bcc: row.payload.bcc,
      subject: row.payload.subject,
      text: '',
      html: row.payload.html,
      inReplyTo: row.payload.inReplyTo,
      references: row.payload.references,
      threadId: row.threadId ?? undefined,
      attachments: row.payload.attachments,
    });

    // The provider owns the message now. Graph's sendMail returns no id, so the only way to find the
    // real message is to re-read the folder — do that before the placeholder goes, or the list is
    // left holding an id whose thread no longer exists.
    if (row.remoteId) {
      await getActiveDriver()
        .deleteDraft(row.remoteId)
        .catch(() => {
          /* provider may have consumed the draft on send */
        });
    }
    await deleteOutbox(db, row.id);
    await invalidateAllFolders(db);
    // Polls Sent for up to half a minute — not something to hold the queue lock for. The placeholder
    // keeps the message on screen (with its attachments) for the whole wait.
    void reconcileSent(db, row, result.threadId || undefined);
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const attempts = row.attempts + 1;

    if (attempts >= MAX_SEND_ATTEMPTS) {
      // Park it as a draft: it stays in the Drafts folder with the error, and the user can resend.
      await updateOutbox(db, row.id, { kind: 'draft', status: 'failed', lastError: message });
      await del(db, { id: row.id });
      toast.error(`Couldn't send "${row.payload.subject || 'your email'}" — saved to drafts`);
      return true;
    }

    await updateOutbox(db, row.id, {
      status: 'queued',
      lastError: message,
      sendAfter: Date.now() + (BACKOFF_MS[attempts] ?? 0),
    });
    return false;
  }
}

// --- pulling the provider's drafts down --------------------------------------

/**
 * Mirror the provider's drafts into the outbox so the Drafts folder reads from one table. Rows the
 * user has edited locally are left alone — their unpushed text outranks the provider's copy.
 */
export async function syncDrafts(db: LocalDB, maxResults: number): Promise<void> {
  const driver = getActiveDriver();
  const providerId = getTokenProvider()!.provider;

  const page = await driver.listDrafts({ maxResults });
  const localRemoteIds = new Set(await outboxRemoteIds(db));
  const remoteIds = page.threads.map((t) => t.id);

  for (const id of remoteIds) {
    // Already represented by a local row (we pushed it) — don't mirror it back in under a second id.
    if (localRemoteIds.has(id)) continue;

    const existing = await getOutbox(db, id);
    if (existing?.dirty) continue;

    const draft = await driver.getDraft(id);
    await upsertOutbox(db, {
      id,
      providerId,
      kind: 'draft',
      status: 'draft',
      remoteId: id,
      threadId: existing?.threadId ?? null,
      payload: {
        to: draft.to ?? [],
        cc: draft.cc ?? [],
        bcc: draft.bcc ?? [],
        subject: draft.subject ?? '',
        html: draft.content ?? '',
      },
      dirty: false,
      attempts: 0,
      lastError: null,
      sendAfter: null,
      createdAt: existing?.createdAt ?? now(),
      updatedAt: now(),
    });
  }

  await pruneRemoteDrafts(db, providerId, remoteIds);
}
