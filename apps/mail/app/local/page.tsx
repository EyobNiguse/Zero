/**
 * Browser-first mail spike. Pick a provider, sign in with PKCE in the browser,
 * fetch threads straight from Gmail / Microsoft Graph, persist them into the
 * OPFS-backed SQLite mirror, and render from the DB. Opening a thread fetches
 * full message bodies + attachment metadata; attachment bytes download on
 * click. Compose sends (with attachments) straight to the provider.
 * Route: /local
 */
import { useCallback, useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { createTokenProvider, type ProviderId, type TokenProvider } from './auth';
import {
  getLocalDB,
  hydrateThreads,
  hydrateMessages,
  list,
  getThreadMessages,
  getMessageAttachments,
  type Thread,
  type Message,
  type Attachment,
} from './db';
import { createMailDriver, type MailFolder } from './mail';
import { bytesToBase64 } from './mail/mime';

type Status = 'idle' | 'signing-in' | 'loading' | 'ready' | 'error';

export default function LocalMailSpike() {
  const [providerId, setProviderId] = useState<ProviderId>('google');
  const [auth, setAuth] = useState<TokenProvider | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attByMsg, setAttByMsg] = useState<Record<string, Attachment[]>>({});
  const [threadBusy, setThreadBusy] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);

  // Show whatever is already mirrored in SQLite before any network call —
  // scoped to the last-used provider so a stale thread from the other provider
  // can't be opened under the wrong driver.
  useEffect(() => {
    const last = localStorage.getItem('local.provider') ?? undefined;
    getLocalDB()
      .then((db) => list(db, { providerId: last }))
      .then(setThreads)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const load = useCallback(async (provider: TokenProvider, folderId: string) => {
    setStatus('loading');
    const driver = createMailDriver(provider, provider.provider);
    const page = await driver.listThreads({ maxResults: 25, labelId: folderId });
    // Tag every fetched thread with the folder id we actually queried. Graph's
    // message.parentFolderId isn't guaranteed to equal the folder id returned by
    // the mailFolders endpoint, so relying on it made the folder filter miss.
    for (const t of page.threads) {
      if (!t.labelIds.includes(folderId)) t.labelIds.push(folderId);
    }
    // Persist into the local mirror, then render straight from the DB — scoped
    // to this provider + folder so providers never mix in the list.
    const db = await getLocalDB();
    await hydrateThreads(db, page.threads);
    setThreads(await list(db, { providerId: provider.provider, labelId: folderId }));
    setStatus('ready');
  }, []);

  // Shared post-sign-in step: record the account, list folders, land on inbox.
  const afterSignIn = useCallback(
    async (provider: TokenProvider) => {
      setAuth(provider);
      setProviderId(provider.provider);
      setEmail(provider.getEmail());
      // Remember the provider so a refresh / redirect-return can restore it.
      localStorage.setItem('local.provider', provider.provider);

      const driver = createMailDriver(provider, provider.provider);
      const folderList = await driver.listFolders();
      setFolders(folderList);
      const inbox = folderList.find((f) => f.role === 'inbox')?.id ?? folderList[0]?.id ?? null;
      setActiveFolder(inbox);
      if (inbox) await load(provider, inbox);
      else setStatus('ready');
    },
    [load],
  );

  const connect = useCallback(async () => {
    setError(null);
    setStatus('signing-in');
    try {
      const provider = createTokenProvider(providerId);
      // Persist the choice before signing in so a redirect return / refresh can
      // restore it (Microsoft's signIn navigates away and never resolves here).
      localStorage.setItem('local.provider', providerId);
      await provider.signIn();
      await afterSignIn(provider);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [providerId, afterSignIn]);

  // On load, restore the Microsoft session — covers both a plain refresh (MSAL
  // caches the account) and returning from the loginRedirect. Google is skipped:
  // GIS keeps its token in memory with no refresh token, so it can't persist.
  useEffect(() => {
    if (localStorage.getItem('local.provider') !== 'microsoft') return;
    (async () => {
      setStatus('signing-in');
      try {
        const provider = createTokenProvider('microsoft');
        if (await provider.restoreSession()) await afterSignIn(provider);
        else setStatus('idle');
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [afterSignIn]);

  // Switch folders: reload the thread list scoped to the picked folder.
  const openFolder = useCallback(
    async (folderId: string) => {
      if (!auth) return;
      setActiveFolder(folderId);
      setSelected(null);
      setError(null);
      try {
        await load(auth, folderId);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [auth, load],
  );

  // Sign out of the current provider and clear the view, so you can connect
  // with the other provider (or a different account).
  const disconnect = useCallback(async () => {
    try {
      await auth?.signOut();
    } catch {
      /* ignore — reset the UI regardless */
    }
    // Stop restoring this provider on the next load, and purge any leftover
    // MSAL state (e.g. a stuck interaction_in_progress flag).
    localStorage.removeItem('local.provider');
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('msal.')) sessionStorage.removeItem(key);
    }
    setAuth(null);
    setEmail(null);
    setThreads([]);
    setFolders([]);
    setActiveFolder(null);
    setSelected(null);
    setMessages([]);
    setAttByMsg({});
    setStatus('idle');
    setError(null);
  }, [auth]);

  const refresh = useCallback(async () => {
    if (!auth || !activeFolder) return;
    setError(null);
    try {
      await load(auth, activeFolder);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [auth, activeFolder, load]);

  // Open a thread: fetch full contents when signed in (else show cached),
  // persist, then render messages + attachment metadata from the DB.
  const openThread = useCallback(
    async (t: Thread) => {
      setSelected(t);
      setError(null);
      setThreadBusy(true);
      try {
        const db = await getLocalDB();
        if (auth) {
          const driver = createMailDriver(auth, auth.provider);
          const detail = await driver.getThread(t.id);
          await hydrateMessages(db, detail.messages, detail.attachments);
        }
        const msgs = await getThreadMessages(db, t.id);
        const entries = await Promise.all(
          msgs.map(async (m) => [m.id, await getMessageAttachments(db, m.id)] as const),
        );
        setMessages(msgs);
        setAttByMsg(Object.fromEntries(entries));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setThreadBusy(false);
      }
    },
    [auth],
  );

  const downloadAttachment = useCallback(
    async (messageId: string, att: Attachment) => {
      if (!auth) {
        setError('sign in to download attachments');
        return;
      }
      try {
        const driver = createMailDriver(auth, auth.provider);
        const { bytes } = await driver.getAttachment(messageId, att.attachmentId);
        const blob = new Blob([bytes], { type: att.mimeType ?? 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = att.filename ?? 'attachment';
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [auth],
  );

  const busy = status === 'signing-in' || status === 'loading';

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: 16, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Browser-first mail</h1>
      <p style={{ color: '#666', fontSize: 13 }}>
        Signs in with PKCE in the browser, mirrors into local SQLite, reads full threads, and sends.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '16px 0' }}>
        <select
          value={providerId}
          onChange={(e) => setProviderId(e.target.value as ProviderId)}
          disabled={busy}
          style={{ padding: '6px 8px' }}
        >
          <option value="google">Google (Gmail)</option>
          <option value="microsoft">Microsoft (Graph)</option>
        </select>
        <button onClick={connect} disabled={busy} style={btn}>
          {status === 'signing-in' ? 'Signing in…' : 'Connect & list'}
        </button>
        {auth && (
          <button onClick={refresh} disabled={busy} style={btn}>
            Refresh
          </button>
        )}
        {auth && (
          <button onClick={() => setComposeOpen(true)} style={{ ...btn, marginLeft: 'auto' }}>
            Compose
          </button>
        )}
        <button onClick={disconnect} disabled={busy} style={{ ...btn, ...(auth ? {} : { marginLeft: 'auto' }) }}>
          {auth ? 'Sign out' : 'Reset'}
        </button>
      </div>

      {email && (
        <p style={{ fontSize: 13, color: '#333' }}>
          Signed in as <strong>{email}</strong>
        </p>
      )}
      {status === 'loading' && <p>Loading threads…</p>}
      {error && <pre style={{ color: '#b00', whiteSpace: 'pre-wrap', fontSize: 12 }}>{error}</pre>}

      <div style={{ display: 'flex', gap: 16, marginTop: 12, alignItems: 'flex-start' }}>
        {/* Folder list */}
        {folders.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: '0 0 180px' }}>
            {folders.map((f) => (
              <li
                key={f.id}
                onClick={() => openFolder(f.id)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  background: activeFolder === f.id ? '#f0f6ff' : 'transparent',
                  fontWeight: activeFolder === f.id ? 600 : 400,
                }}
              >
                <span>{f.name}</span>
                {f.unread ? <span style={{ color: '#999' }}>{f.unread}</span> : null}
              </li>
            ))}
          </ul>
        )}

        {/* Thread list */}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: '0 0 340px' }}>
          {threads.length === 0 && <li style={{ color: '#999', fontSize: 13 }}>No threads yet.</li>}
          {threads.map((t) => (
            <li
              key={t.id}
              onClick={() => openThread(t)}
              style={{
                borderBottom: '1px solid #eee',
                padding: '10px 8px',
                cursor: 'pointer',
                background: selected?.id === t.id ? '#f0f6ff' : 'transparent',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {t.latestSender?.name || t.latestSender?.email || 'Unknown'}
              </div>
              <div style={{ fontSize: 14 }}>{t.latestSubject || '(no subject)'}</div>
              <div style={{ fontSize: 12, color: '#999' }}>
                {t.latestReceivedOn ? new Date(t.latestReceivedOn).toLocaleString() : ''}
              </div>
            </li>
          ))}
        </ul>

        {/* Reader */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selected && <p style={{ color: '#999', fontSize: 13 }}>Select a thread to read.</p>}
          {selected && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>
                {selected.latestSubject || '(no subject)'}
              </h2>
              {threadBusy && <p style={{ fontSize: 13 }}>Loading thread…</p>}
              {messages.map((m) => (
                <div
                  key={m.id}
                  style={{ border: '1px solid #eee', borderRadius: 6, padding: 12, margin: '10px 0' }}
                >
                  <div style={{ fontSize: 13, color: '#333' }}>
                    <strong>{m.sender?.name || m.sender?.email || 'Unknown'}</strong>
                    {m.receivedOn && (
                      <span style={{ color: '#999', marginLeft: 8 }}>
                        {new Date(m.receivedOn).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <MessageBody message={m} />
                  <AttachmentList
                    atts={attByMsg[m.id] ?? []}
                    onDownload={(att) => downloadAttachment(m.id, att)}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {composeOpen && auth && (
        <Compose
          auth={auth}
          onClose={() => setComposeOpen(false)}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

function MessageBody({ message }: { message: Message }) {
  if (message.bodyHtml) {
    return (
      <div
        style={{ fontSize: 14, marginTop: 8, overflowX: 'auto' }}
        // Sanitized before render — provider HTML is untrusted.
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.bodyHtml) }}
      />
    );
  }
  return (
    <pre style={{ fontSize: 14, marginTop: 8, whiteSpace: 'pre-wrap' }}>
      {message.bodyText || message.snippet || '(no content)'}
    </pre>
  );
}

function AttachmentList({
  atts,
  onDownload,
}: {
  atts: Attachment[];
  onDownload: (att: Attachment) => void;
}) {
  const visible = atts.filter((a) => !a.inline);
  if (visible.length === 0) return null;
  return (
    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {visible.map((a) => (
        <button
          key={a.id}
          onClick={() => onDownload(a)}
          style={{ ...btn, fontSize: 12, padding: '4px 8px' }}
          title={a.mimeType ?? ''}
        >
          📎 {a.filename || 'attachment'}
          {a.size != null ? ` (${Math.ceil(a.size / 1024)} KB)` : ''}
        </button>
      ))}
    </div>
  );
}

function Compose({
  auth,
  onClose,
  onError,
}: {
  auth: TokenProvider;
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const splitAddrs = (s: string) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

  const send = async () => {
    setSending(true);
    try {
      const attachments = await Promise.all(
        files.map(async (f) => ({
          filename: f.name,
          mimeType: f.type || 'application/octet-stream',
          contentBase64: bytesToBase64(new Uint8Array(await f.arrayBuffer())),
        })),
      );
      const driver = createMailDriver(auth, auth.provider);
      await driver.sendMessage({
        to: splitAddrs(to),
        cc: cc ? splitAddrs(cc) : undefined,
        subject,
        text: body,
        attachments: attachments.length ? attachments : undefined,
      });
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>New message</h2>
        <input placeholder="To (comma-separated)" value={to} onChange={(e) => setTo(e.target.value)} style={field} />
        <input placeholder="Cc (optional)" value={cc} onChange={(e) => setCc(e.target.value)} style={field} />
        <input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} style={field} />
        <textarea
          placeholder="Message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ ...field, minHeight: 140, resize: 'vertical' }}
        />
        <input
          type="file"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          style={{ margin: '8px 0', fontSize: 13 }}
        />
        {files.length > 0 && (
          <div style={{ fontSize: 12, color: '#666' }}>
            {files.map((f) => f.name).join(', ')}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={onClose} disabled={sending} style={btn}>
            Cancel
          </button>
          <button onClick={send} disabled={sending || !to || !subject} style={btn}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: '6px 12px',
  border: '1px solid #ccc',
  borderRadius: 6,
  background: '#fff',
  cursor: 'pointer',
};

const field: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px',
  margin: '6px 0',
  border: '1px solid #ccc',
  borderRadius: 6,
  fontSize: 14,
  boxSizing: 'border-box',
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modal: React.CSSProperties = {
  background: '#fff',
  borderRadius: 10,
  padding: 20,
  width: 'min(560px, 92vw)',
  boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
};
