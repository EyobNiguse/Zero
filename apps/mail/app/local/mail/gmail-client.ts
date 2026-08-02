/**
 * Gmail REST transport — browser -> gmail.googleapis.com directly (CORS).
 *
 * HTTP only: auth headers, URL construction, multipart batching, response parsing. Every method
 * returns Gmail's own wire shapes; nothing here knows about the local db or the driver contract.
 * Mapping lives in ./gmail.ts.
 */
import type { TokenProvider } from '../auth/types';

const API_PATH = '/gmail/v1/users/me';
const BASE = `https://gmail.googleapis.com${API_PATH}`;
const BATCH_URL = 'https://gmail.googleapis.com/batch/gmail/v1';
/** Google allows 100 per batch but advises staying under 50. */
const BATCH_LIMIT = 50;

/** List rows render from these headers; bodies arrive with format=full when a thread is opened. */
const THREAD_METADATA =
  '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date';

// --- wire shapes -------------------------------------------------------------

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

export interface GmailThread {
  id: string;
  messages?: GmailMessage[];
}

export interface GmailLabel {
  id: string;
  name: string;
  type?: string;
  messagesUnread?: number;
  messagesTotal?: number;
}

export interface GmailHistoryMessage {
  message: { id: string; threadId: string };
}

export interface GmailHistoryPage {
  history?: {
    messagesAdded?: GmailHistoryMessage[];
    messagesDeleted?: GmailHistoryMessage[];
    labelsAdded?: GmailHistoryMessage[];
    labelsRemoved?: GmailHistoryMessage[];
  }[];
  historyId?: string;
}

export interface GmailDraftSummary {
  id: string;
  message?: { id: string; threadId: string };
}

export interface GmailSendAs {
  sendAsEmail: string;
  displayName?: string;
  isPrimary?: boolean;
}

export interface GmailLabelColor {
  backgroundColor: string;
  textColor: string;
}

export class GmailError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GmailError';
  }
}

// --- client ------------------------------------------------------------------

export interface GmailClient {
  listLabels(): Promise<GmailLabel[]>;

  /** Ids only — Gmail's list endpoint returns no metadata. Pair with getThreadsMetadata. */
  listThreadIds(opts: {
    pageToken?: string;
    maxResults?: number;
    labelId?: string;
    q?: string;
  }): Promise<{ ids: string[]; nextPageToken: string | null }>;

  /** Header-only threads, batched. Parts that failed are dropped. */
  getThreadsMetadata(ids: string[]): Promise<GmailThread[]>;

  /** One thread with its full MIME payload. */
  getThreadFull(threadId: string): Promise<GmailThread>;

  getProfile(): Promise<{ historyId?: string }>;

  /** Throws GmailError(404) once startHistoryId ages out — the caller maps that to a resync. */
  listHistory(startHistoryId: string, labelId?: string): Promise<GmailHistoryPage>;

  getAttachmentRaw(messageId: string, attachmentId: string): Promise<{ data: string; size: number }>;

  sendRaw(raw: string, threadId?: string): Promise<{ id: string; threadId: string }>;
  modifyThread(threadId: string, addLabelIds: string[], removeLabelIds: string[]): Promise<void>;
  trashThread(threadId: string): Promise<void>;

  /** id present => replace that draft in place, else create a new one. */
  putDraft(raw: string, id?: string | null): Promise<{ id: string }>;
  getDraftRaw(id: string): Promise<{ id: string; message?: GmailMessage }>;
  listDraftsRaw(opts: {
    maxResults?: number;
    pageToken?: string;
  }): Promise<{ drafts: GmailDraftSummary[]; nextPageToken: string | null }>;
  deleteDraft(id: string): Promise<void>;

  listSendAs(): Promise<GmailSendAs[]>;

  createLabelRaw(input: {
    name: string;
    color?: GmailLabelColor;
  }): Promise<{ id: string; name: string }>;
  updateLabelRaw(
    id: string,
    input: { name: string; color?: GmailLabelColor },
  ): Promise<{ id: string; name: string }>;
  deleteLabelRaw(id: string): Promise<void>;
}

export function createGmailClient(auth: TokenProvider): GmailClient {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await auth.getAccessToken();
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
    if (!res.ok) {
      throw new GmailError(
        res.status,
        `gmail ${init?.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`,
      );
    }
    // DELETE (drafts) and other 204s return no body.
    if (res.status === 204) return null as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  /**
   * Many GETs as one multipart/mixed batch. Results keep the input order via Content-ID — the docs
   * warn the server may run the parts in any order. A part that failed comes back null.
   */
  async function batchGet<T>(paths: string[]): Promise<(T | null)[]> {
    const out: (T | null)[] = Array.from({ length: paths.length }, () => null);

    for (let start = 0; start < paths.length; start += BATCH_LIMIT) {
      const chunk = paths.slice(start, start + BATCH_LIMIT);
      const token = await auth.getAccessToken();
      const boundary = `zero_batch_${start}_${chunk.length}`;

      const body =
        chunk
          .map(
            (p, i) =>
              `--${boundary}\r\n` +
              `Content-Type: application/http\r\n` +
              `Content-ID: <${start + i}>\r\n\r\n` +
              `GET ${API_PATH}${p}\r\n\r\n`,
          )
          .join('') + `--${boundary}--\r\n`;

      const res = await fetch(BATCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/mixed; boundary=${boundary}`,
        },
        body,
      });
      if (!res.ok) {
        throw new GmailError(res.status, `gmail batch -> ${res.status} ${await res.text()}`);
      }

      const text = await res.text();
      const declared = /boundary=(?:"([^"]+)"|([^;\s]+))/.exec(res.headers.get('Content-Type') ?? '');
      const sep = `--${declared?.[1] ?? declared?.[2] ?? boundary}`;

      for (const part of text.split(sep)) {
        const id = /Content-ID:\s*<response-(\d+)>/i.exec(part);
        const open = part.indexOf('{');
        const close = part.lastIndexOf('}');
        if (!id || open === -1 || close < open) continue;
        try {
          out[Number(id[1])] = JSON.parse(part.slice(open, close + 1)) as T;
        } catch {
          // Leave the slot null; the caller drops it.
        }
      }
    }

    return out;
  }

  const labelBody = (input: { name: string; color?: GmailLabelColor }) => ({
    name: input.name,
    ...(input.color ? { color: input.color } : {}),
  });

  return {
    async listLabels() {
      const data = await call<{ labels?: GmailLabel[] }>(`/labels`);
      return data.labels ?? [];
    },

    async listThreadIds({ pageToken, maxResults = 25, labelId, q }) {
      const qs = new URLSearchParams({ maxResults: String(maxResults) });
      if (pageToken) qs.set('pageToken', pageToken);
      // Search query takes precedence; otherwise scope by label id.
      if (q) qs.set('q', q);
      else if (labelId) qs.set('labelIds', labelId);

      const listed = await call<{ threads?: { id: string }[]; nextPageToken?: string }>(
        `/threads?${qs.toString()}`,
      );
      return {
        ids: (listed.threads ?? []).map((t) => t.id),
        nextPageToken: listed.nextPageToken ?? null,
      };
    },

    async getThreadsMetadata(ids) {
      const full = await batchGet<GmailThread>(ids.map((id) => `/threads/${id}${THREAD_METADATA}`));
      return full.filter((t): t is GmailThread => t != null);
    },

    getThreadFull(threadId) {
      return call<GmailThread>(`/threads/${threadId}?format=full`);
    },

    getProfile() {
      return call<{ historyId?: string }>('/profile');
    },

    listHistory(startHistoryId, labelId) {
      // History is mailbox-wide; labelId only narrows it. Omitting it reports changes in every
      // folder in one read — including the labelRemoved events that say a thread has left one.
      const qs = new URLSearchParams({ startHistoryId });
      if (labelId) qs.set('labelId', labelId);
      for (const t of ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved']) {
        qs.append('historyTypes', t);
      }
      return call<GmailHistoryPage>(`/history?${qs.toString()}`);
    },

    getAttachmentRaw(messageId, attachmentId) {
      return call<{ data: string; size: number }>(
        `/messages/${messageId}/attachments/${attachmentId}`,
      );
    },

    sendRaw(raw, threadId) {
      return call<{ id: string; threadId: string }>(`/messages/send`, {
        method: 'POST',
        body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
      });
    },

    async modifyThread(threadId, addLabelIds, removeLabelIds) {
      await call(`/threads/${threadId}/modify`, {
        method: 'POST',
        body: JSON.stringify({ addLabelIds, removeLabelIds }),
      });
    },

    async trashThread(threadId) {
      // Gmail has a first-class trash endpoint (moves every message + adds TRASH).
      await call(`/threads/${threadId}/trash`, { method: 'POST' });
    },

    putDraft(raw, id) {
      const body = JSON.stringify({ message: { raw } });
      return id
        ? call<{ id: string }>(`/drafts/${id}`, { method: 'PUT', body })
        : call<{ id: string }>(`/drafts`, { method: 'POST', body });
    },

    getDraftRaw(id) {
      return call<{ id: string; message?: GmailMessage }>(`/drafts/${id}?format=full`);
    },

    async listDraftsRaw({ maxResults = 25, pageToken }) {
      const qs = new URLSearchParams({ maxResults: String(maxResults) });
      if (pageToken) qs.set('pageToken', pageToken);
      const data = await call<{ drafts?: GmailDraftSummary[]; nextPageToken?: string }>(
        `/drafts?${qs.toString()}`,
      );
      return { drafts: data.drafts ?? [], nextPageToken: data.nextPageToken ?? null };
    },

    async deleteDraft(id) {
      await call(`/drafts/${id}`, { method: 'DELETE' });
    },

    async listSendAs() {
      // Gmail exposes configured send-as identities under settings.sendAs.
      const data = await call<{ sendAs?: GmailSendAs[] }>(`/settings/sendAs`);
      return data.sendAs ?? [];
    },

    createLabelRaw(input) {
      return call<{ id: string; name: string }>(`/labels`, {
        method: 'POST',
        body: JSON.stringify({
          ...labelBody(input),
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        }),
      });
    },

    updateLabelRaw(id, input) {
      return call<{ id: string; name: string }>(`/labels/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(labelBody(input)),
      });
    },

    async deleteLabelRaw(id) {
      await call(`/labels/${id}`, { method: 'DELETE' });
    },
  };
}
