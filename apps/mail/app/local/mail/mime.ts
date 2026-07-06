/** RFC 822 / MIME builder + base64 helpers for the browser mail drivers. */
import type { SendInput } from './types';

/** UTF-8 string -> base64url (Gmail's `raw` field wants url-safe, unpadded). */
export function base64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Raw bytes -> standard base64 (padded). Chunked to avoid arg-length limits. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Standard base64 -> bytes. */
export function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** base64url (Gmail attachment payloads) -> bytes. */
export function base64UrlDecode(b64url: string): Uint8Array {
  return base64Decode(b64url.replace(/-/g, '+').replace(/_/g, '/'));
}

/** Split a base64 blob into RFC-2045 76-char lines. */
function wrap76(b64: string): string {
  return b64.replace(/.{76}/g, '$&\r\n');
}

export function buildMime(input: SendInput, from?: string): string {
  const headers: string[] = [];
  if (from) headers.push(`From: ${from}`);
  headers.push(`To: ${input.to.join(', ')}`);
  if (input.cc?.length) headers.push(`Cc: ${input.cc.join(', ')}`);
  if (input.bcc?.length) headers.push(`Bcc: ${input.bcc.join(', ')}`);
  headers.push(`Subject: ${input.subject}`);
  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) headers.push(`References: ${input.references}`);
  headers.push('MIME-Version: 1.0');

  const bodyType = input.html ? 'text/html' : 'text/plain';
  const body = input.html ?? input.text;
  const atts = input.attachments ?? [];

  // No attachments -> a single-part message.
  if (atts.length === 0) {
    headers.push(`Content-Type: ${bodyType}; charset="UTF-8"`);
    return [...headers, '', body].join('\r\n');
  }

  // Attachments -> multipart/mixed: the body as the first part, then each file.
  const boundary = `zero_${crypto.randomUUID()}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const parts: string[] = [];
  parts.push(`--${boundary}`);
  parts.push(`Content-Type: ${bodyType}; charset="UTF-8"`, '', body);
  for (const a of atts) {
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${a.mimeType}; name="${a.filename}"`);
    parts.push(`Content-Disposition: attachment; filename="${a.filename}"`);
    parts.push('Content-Transfer-Encoding: base64', '', wrap76(a.contentBase64));
  }
  parts.push(`--${boundary}--`);

  return [...headers, '', ...parts].join('\r\n');
}
