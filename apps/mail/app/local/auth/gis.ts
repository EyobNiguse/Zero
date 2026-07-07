/**
 * Google browser auth via Google Identity Services (GIS) token client.
 * Issues ~1h access tokens, no refresh token — silent renewal works only while the Google session cookie is alive.
 */
import type { TokenProvider } from './types';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'openid',
  'email',
  'profile',
].join(' ');

export interface GisOptions {
  clientId: string;
}

let scriptPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// Cache the access token so a refresh reuses it instead of triggering a GIS popup (blocked without a user gesture).
const SESSION_KEY = 'local.google.session';
interface CachedSession {
  token: string;
  expiresAt: number;
  email: string | null;
}
function loadCachedSession(): CachedSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as CachedSession) : null;
  } catch {
    return null;
  }
}
function saveCachedSession(s: CachedSession): void {
  if (typeof window !== 'undefined') localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
function clearCachedSession(): void {
  if (typeof window !== 'undefined') localStorage.removeItem(SESSION_KEY);
}

export function createGoogleProvider(opts: GisOptions): TokenProvider {
  let client: google.accounts.oauth2.TokenClient | null = null;
  let token: string | null = null;
  let expiresAt = 0; // epoch ms
  let email: string | null = null;

  // Seed identity from a cached session so `hint` is available for silent auth.
  const cached = loadCachedSession();
  if (cached) email = cached.email;

  function persist() {
    if (token) saveCachedSession({ token, expiresAt, email });
  }

  // Token client uses one callback; route each request to its own promise via this pointer.
  let pending: { resolve: (t: string) => void; reject: (e: unknown) => void } | null = null;

  async function ensureClient() {
    if (client) return;
    await loadGis();
    client = window.google.accounts.oauth2.initTokenClient({
      client_id: opts.clientId,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) {
          pending?.reject(new Error(resp.error));
        } else {
          token = resp.access_token;
          // expires_in is seconds; keep a 60s safety margin.
          expiresAt = Date.now() + (Number(resp.expires_in) - 60) * 1000;
          persist();
          pending?.resolve(resp.access_token);
        }
        pending = null;
      },
    });
  }

  function request(prompt: '' | 'consent'): Promise<string> {
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      // hint lets GIS pick the account silently, improving prompt:'' success.
      client!.requestAccessToken({ prompt, ...(email ? { hint: email } : {}) });
    });
  }

  async function fetchEmail(accessToken: string) {
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok) email = ((await r.json()) as { email?: string }).email ?? null;
      persist();
    } catch {
      /* non-fatal */
    }
  }

  return {
    provider: 'google',

    async signIn() {
      await ensureClient();
      const t = await request('consent');
      await fetchEmail(t);
    },

    async restoreSession() {
      // Reuse a still-valid cached token first (refresh path must not trigger a blocked GIS popup).
      const c = loadCachedSession();
      if (c && Date.now() < c.expiresAt) {
        token = c.token;
        expiresAt = c.expiresAt;
        email = c.email;
        return true;
      }
      try {
        await ensureClient();
        const t = await request('');
        await fetchEmail(t);
        return true;
      } catch {
        return false;
      }
    },

    isSignedIn() {
      return token != null;
    },

    async getAccessToken() {
      if (token && Date.now() < expiresAt) return token;
      // Cached token from another tab / this session may still be live.
      const c = loadCachedSession();
      if (c && Date.now() < c.expiresAt) {
        token = c.token;
        expiresAt = c.expiresAt;
        email = c.email;
        return token;
      }
      await ensureClient();
      // silent refresh — succeeds only while the Google session is live
      return request('');
    },

    getEmail() {
      return email;
    },

    async signOut() {
      if (token) window.google?.accounts?.oauth2?.revoke?.(token, () => {});
      token = null;
      expiresAt = 0;
      email = null;
      clearCachedSession();
    },
  };
}
