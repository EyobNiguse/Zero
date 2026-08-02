import type { ParsedMessage } from '../../../../server/src/types';
import type { IGetThreadResponse } from '../../../../server/src/lib/driver/types';
import type { Message, AttachmentMeta, Label, ThreadBundle } from '../db';

/** Strip tags/entities down to readable text for the list-row preview. */
function stripHtml(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toParsedMessage(
  m: Message,
  atts: AttachmentMeta[],
  labels: Label[] = [],
): ParsedMessage {
  const fullHtml = m.bodyHtml ?? m.bodyText ?? '';
  const unread = labels.some((l) => l.name === 'UNREAD');

  const preview = (m.snippet || m.bodyText || stripHtml(m.bodyHtml ?? ''))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return {
    id: m.id,
    title: m.subject ?? '',
    subject: m.subject ?? '',
    tags: labels.map((l) => ({ id: l.id, name: l.name, type: 'user' })),
    sender: m.sender ?? { email: '' },
    to: m.toRecipients ?? [],
    cc: m.ccRecipients ?? null,
    bcc: null,
    tls: true,
    receivedOn: m.receivedOn ?? '',
    unread,
    body: preview,
    processedHtml: fullHtml,
    blobUrl: '',
    decodedBody: fullHtml,
    threadId: m.threadId,
    messageId: m.id,
    isDraft: false,
    attachments: atts.map((a) => ({
      attachmentId: a.attachmentId,
      filename: a.filename ?? '',
      mimeType: a.mimeType ?? '',
      size: a.size ?? 0,
      body: '',
      headers: [],
    })),
  };
}

/** One thread's mirrored rows, rendered. The single path from SQLite to what the UI holds. */
export function toThreadDetail(bundle: ThreadBundle): IGetThreadResponse {
  const messages = bundle.messages.map((m) =>
    toParsedMessage(m, bundle.attachments.get(m.id) ?? [], bundle.labels),
  );
  return toThreadResponse(messages, bundle.labels, bundle.thread?.replyCount);
}

export function toThreadResponse(
  messages: ParsedMessage[],
  labels: Label[],
  /** The thread row's . Only the mirrored messages are known otherwise, which is 1 for a
   *  thread the list has seen but nobody has opened. */
  replyCount?: number | null,
): IGetThreadResponse {
  return {
    messages,
    latest: messages[messages.length - 1],
    hasUnread: labels.some((l) => l.name === 'UNREAD'),
    totalReplies: Math.max(replyCount ?? 0, messages.length),
    labels: labels.map((l) => ({ id: l.id, name: l.name })),
  };
}
