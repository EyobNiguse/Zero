import {
  hydrateThreads,
  hydrateMessages,
  getThreadMessages,
  getMessageAttachments,
  getThreadLabels,
} from '../db';
import DOMPurify from 'dompurify';
import { getActiveDriver, getActiveProvider, getLocalDB } from './bridge';
import { toParsedMessage, toThreadResponse } from './adapters';
import type { ProviderId } from '../auth';

// The real UI uses lowercase folder names; translate to each provider's id/alias.
function providerFolder(provider: ProviderId, folder: string | undefined): string {
  const f = (folder ?? 'inbox').toLowerCase();
  const google: Record<string, string> = {
    inbox: 'INBOX', sent: 'SENT', draft: 'DRAFT', drafts: 'DRAFT',
    spam: 'SPAM', bin: 'TRASH', trash: 'TRASH', archive: 'INBOX',
    important: 'IMPORTANT', starred: 'STARRED',
  };
  const microsoft: Record<string, string> = {
    inbox: 'inbox', sent: 'sentitems', draft: 'drafts', drafts: 'drafts',
    spam: 'junkemail', bin: 'deleteditems', trash: 'deleteditems', archive: 'archive',
  };
  return (provider === 'google' ? google : microsoft)[f] ?? f;
}

export const localResolvers: Record<string, (input: any) => Promise<any>> = {
  'mail.listThreads': async (input) => {
    const provider = getActiveProvider();
    const driver = getActiveDriver();
    const folderId = providerFolder(provider!.provider, input?.folder);
    const page = await driver.listThreads({
      labelId: folderId,
      pageToken: input?.cursor || undefined,
      maxResults: 25,
    });
    for (const t of page.threads) {
      if (!t.labelIds.includes(folderId)) t.labelIds.push(folderId);
    }
    const db = await getLocalDB();
    await hydrateThreads(db, page.threads);
    return {
      threads: page.threads.map((t) => ({ id: t.thread.id, historyId: null })),
      nextPageToken: page.nextPageToken,
    };
  },

  'mail.get': async (input) => {
    const driver = getActiveDriver();
    const db = await getLocalDB();
    const detail = await driver.getThread(input.id);
    await hydrateMessages(db, detail.messages, detail.attachments);

    const rows = await getThreadMessages(db, input.id);
    const messages = await Promise.all(
      rows.map(async (m) => toParsedMessage(m, await getMessageAttachments(db, m.id))),
    );
    const labels = await getThreadLabels(db, input.id);
    return toThreadResponse(messages, labels);
  },

  // The reader injects processedHtml into a shadow root; the server normally
  // sanitizes + rewrites here. Locally: sanitize the provider HTML and pass it
  // through (image-blocking/theming can come later).
  'mail.processEmailContent': async (input) => {
    const html = typeof input?.html === 'string' ? input.html : '';
    return { processedHtml: DOMPurify.sanitize(html), hasBlockedImages: false };
  },

  'mail.getMessageAttachments': async (input) => {
    const db = await getLocalDB();
    const atts = await getMessageAttachments(db, input.messageId ?? input.id);
    return atts.map((a) => ({
      attachmentId: a.attachmentId,
      filename: a.filename ?? '',
      mimeType: a.mimeType ?? '',
      size: a.size ?? 0,
      body: '',
      headers: [],
    }));
  },

  'labels.list': async () => {
    const driver = getActiveDriver();
    const folders = await driver.listFolders();
    return folders.map((f) => ({ id: f.id, name: f.name, color: undefined, type: 'user' }));
  },

  'connections.list': async () => {
    const p = getActiveProvider();
    if (!p) return [];
    return [{ id: 'local', email: p.getEmail() ?? '', name: p.getEmail() ?? '', providerId: p.provider }];
  },

  'connections.getDefault': async () => {
    const p = getActiveProvider();
    if (!p) return null;
    return { id: 'local', email: p.getEmail() ?? '', name: p.getEmail() ?? '', providerId: p.provider };
  },
};
