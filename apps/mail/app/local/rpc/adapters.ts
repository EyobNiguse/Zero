import type { ParsedMessage } from '../../../../server/src/types';
import type { IGetThreadResponse } from '../../../../server/src/lib/driver/types';
import type { Message, AttachmentMeta, Label } from '../db';

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
  // List rows render `body` as text; keep it a clean, short plain-text preview.
  // The reader renders decodedBody/processedHtml, which stay full HTML.
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

export function toThreadResponse(
  messages: ParsedMessage[],
  labels: Label[],
  /** The thread row's count. Only the mirrored messages are known otherwise, which is 1 for a
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
