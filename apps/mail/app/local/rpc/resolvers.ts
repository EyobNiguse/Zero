import {
  hydrateThreads,
  hydrateMessages,
  getThreadMessages,
  getMessageAttachments,
  getThreadLabels,
  applyThreadLabels,
  findThreadsByFolderWithPagination,
  del,
} from '../db';
import type { LocalDB } from '../db';
import DOMPurify from 'dompurify';
import { getActiveDriver, getActiveProvider, getLocalDB, localSignOut } from './bridge';
import { toParsedMessage, toThreadResponse } from './adapters';
import type { ProviderId } from '../auth';
import * as store from './local-store';
import { bytesToBase64 } from '../mail/mime';
import { folderSyncedAt, threadSyncedAt } from './sync-state';

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
const SYNC_TTL_MS = 2 * 60 * 1000; // 2 minutes
const PAGE_SIZE = 25;

function stale(map: Map<string, number>, key: string, now: number): boolean {
  const last = map.get(key);
  return last === undefined || now - last >= SYNC_TTL_MS;
}

/** Run a provider call, retrying once (warms the token cache after a login/redirect). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

/** Pull the latest page of a folder from the provider into the SQLite mirror. */
async function syncFolder(db: LocalDB, folderId: string): Promise<void> {
  const driver = getActiveDriver();
  // Gmail archive isn't a label — fetch by search, store under the synthetic 'archive' key.
  const args =
    getActiveProvider()?.provider === 'google' && folderId === 'archive'
      ? { q: 'in:archive', maxResults: PAGE_SIZE }
      : { labelId: folderId, maxResults: PAGE_SIZE };
  const page = await withRetry(() => driver.listThreads(args));
  for (const t of page.threads) {
    if (!t.labelIds.includes(folderId)) t.labelIds.push(folderId);
  }
  await hydrateThreads(db, page.threads);
  folderSyncedAt.set(folderId, Date.now());
}

/** Pull one thread's full contents from the provider into the SQLite mirror. */
async function syncThread(db: LocalDB, threadId: string): Promise<void> {
  const driver = getActiveDriver();
  const detail = await withRetry(() => driver.getThread(threadId));
  await hydrateMessages(db, detail.messages, detail.attachments);
  threadSyncedAt.set(threadId, Date.now());
}

/** Apply a label change to one thread: provider first, then the local mirror. */
async function modifyThread(threadId: string, add: string[], remove: string[]): Promise<void> {
  const driver = getActiveDriver();
  const db = await getLocalDB();
  await driver.modifyLabels(threadId, add, remove);
  await applyThreadLabels(db, threadId, add, remove);
}

/** Flip a single label on a thread based on its current state. */
async function toggleLabel(threadId: string, label: string): Promise<void> {
  const db = await getLocalDB();
  const has = (await getThreadLabels(db, threadId)).some((l) => l.name === label);
  await modifyThread(threadId, has ? [] : [label], has ? [label] : []);
}

export const localResolvers: Record<string, (input: any) => Promise<any>> = {
  // Read from SQLite; first page syncs only when stale/empty. Cursor is a SQLite date cursor, not a provider token.
  'mail.listThreads': async (input) => {
    const provider = getActiveProvider();
    const db = await getLocalDB();
    const cursor: string | undefined = input?.cursor || undefined;

    // Snooze is local-only (SNOOZED label); read the mirror directly, never sync.
    const isSnoozed = (input?.folder ?? '').toLowerCase() === 'snoozed';
    const folderId = isSnoozed ? 'SNOOZED' : providerFolder(provider!.provider, input?.folder);

    const providerId = provider!.provider;

    if (!cursor && !isSnoozed) {
      const cached = await findThreadsByFolderWithPagination(db, folderId, {
        maxResults: PAGE_SIZE,
        providerId,
      });
      if (cached.threads.length === 0 || stale(folderSyncedAt, folderId, Date.now())) {
        await syncFolder(db, folderId);
      }
    }

    const page = await findThreadsByFolderWithPagination(db, folderId, {
      pageToken: cursor,
      maxResults: PAGE_SIZE,
      providerId,
    });
    return {
      threads: page.threads.map((t) => ({ id: t.id, historyId: null })),
      nextPageToken: page.nextPageToken,
    };
  },

  // Serve from SQLite; re-fetch only when the thread is absent or stale.
  'mail.get': async (input) => {
    const db = await getLocalDB();
    const cached = await getThreadMessages(db, input.id);
    if (cached.length === 0 || stale(threadSyncedAt, input.id, Date.now())) {
      await syncThread(db, input.id);
    }

    const rows = await getThreadMessages(db, input.id);
    const labels = await getThreadLabels(db, input.id);
    const messages = await Promise.all(
      rows.map(async (m) => toParsedMessage(m, await getMessageAttachments(db, m.id), labels)),
    );
    return toThreadResponse(messages, labels);
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

  // Map the UI's compose payload onto the driver's SendInput (one provider send call).
  'mail.send': async (input) => {
    const driver = getActiveDriver();
    const emails = (list?: { email: string }[]): string[] =>
      (list ?? []).map((r) => r.email).filter(Boolean);
    const headers: Record<string, string> = input?.headers ?? {};
    const result = await driver.sendMessage({
      to: emails(input?.to),
      cc: emails(input?.cc),
      bcc: emails(input?.bcc),
      subject: input?.subject ?? '',
      text: '',
      html: input?.message ?? '',
      inReplyTo: headers['In-Reply-To'] || undefined,
      references: headers['References'] || undefined,
      threadId: input?.threadId || undefined,
      attachments: (input?.attachments ?? []).map((a: any) => ({
        filename: a.name,
        mimeType: a.type,
        contentBase64: a.base64,
      })),
    });
    // New message isn't in the mirror yet — bust the thread + folder TTLs so the next read re-syncs.
    const tid = result.threadId || input?.threadId;
    if (tid) threadSyncedAt.delete(tid);
    folderSyncedAt.clear();
    return { success: true, id: result.id, threadId: result.threadId };
  },

  // Delete = trash at the provider, then drop the mirror row so it leaves every view.
  'mail.delete': async (input) => {
    const driver = getActiveDriver();
    const db = await getLocalDB();
    await driver.trashThread(input.id);
    await del(db, { id: input.id });
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
    return { success: true };
  },

  // Drafts (provider-backed). Split comma-separated recipients; id present => update in place.
  'drafts.create': async (input) => {
    const driver = getActiveDriver();
    const split = (s?: string): string[] =>
      (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const res = await driver.createDraft({
      to: split(input?.to),
      cc: split(input?.cc),
      bcc: split(input?.bcc),
      subject: input?.subject ?? '',
      html: input?.message ?? '',
      id: input?.id ?? undefined,
    });
    return { id: res.id, success: true };
  },

  'drafts.get': async (input) => {
    const driver = getActiveDriver();
    return driver.getDraft(input.id);
  },

  'drafts.list': async (input) => {
    const driver = getActiveDriver();
    return driver.listDrafts({ maxResults: input?.maxResults, pageToken: input?.pageToken });
  },

  'drafts.delete': async (input) => {
    const driver = getActiveDriver();
    await driver.deleteDraft(input.id);
    return true;
  },

  'mail.getEmailAliases': async () => {
    const driver = getActiveDriver();
    return driver.getEmailAliases();
  },

  // Force-sync = drop every TTL so the next read re-pulls from the provider.
  'mail.forceSync': async () => {
    folderSyncedAt.clear();
    threadSyncedAt.clear();
    return { success: true };
  },

  // Snooze is local-only (SNOOZED label, out of INBOX); no waker, so unsnooze is manual.
  'mail.snoozeThreads': async (input) => {
    if (!input?.ids?.length) return { success: false, error: 'No thread IDs provided' };
    const db = await getLocalDB();
    await Promise.all(
      input.ids.map((id: string) => applyThreadLabels(db, id, ['SNOOZED'], ['INBOX'])),
    );
    return { success: true };
  },

  'mail.unsnoozeThreads': async (input) => {
    if (!input?.ids?.length) return { success: false, error: 'No thread IDs' };
    const db = await getLocalDB();
    await Promise.all(
      input.ids.map((id: string) => applyThreadLabels(db, id, ['INBOX'], ['SNOOZED'])),
    );
    return { success: true };
  },

  // Sanitize the provider HTML and pass it through (image-blocking/theming later).
  'mail.processEmailContent': async (input) => {
    const html = typeof input?.html === 'string' ? input.html : '';
    return { processedHtml: DOMPurify.sanitize(html), hasBlockedImages: false };
  },

  // UI renders attachments as data URLs — fetch each blob on demand and base64-encode it.
  'mail.getMessageAttachments': async (input) => {
    const db = await getLocalDB();
    const driver = getActiveDriver();
    const messageId: string = input.messageId ?? input.id;
    const atts = await getMessageAttachments(db, messageId);
    return Promise.all(
      atts.map(async (a) => {
        let body = '';
        if (a.attachmentId) {
          try {
            const blob = await driver.getAttachment(messageId, a.attachmentId);
            body = bytesToBase64(blob.bytes);
          } catch {
            /* leave empty — the row still shows, just no preview/download */
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

  'labels.list': async () => {
    const driver = getActiveDriver();
    const folders = await driver.listFolders();
    return folders.map((f) => ({ id: f.id, name: f.name, color: undefined, type: 'user' }));
  },

  'labels.create': async (input) => {
    const driver = getActiveDriver();
    return driver.createLabel({ name: input?.name, color: input?.color });
  },

  'labels.update': async (input) => {
    const driver = getActiveDriver();
    return driver.updateLabel(input.id, { name: input?.name, color: input?.color });
  },

  'labels.delete': async (input) => {
    const driver = getActiveDriver();
    await driver.deleteLabel(input.id);
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
};
