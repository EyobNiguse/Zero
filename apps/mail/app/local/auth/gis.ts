/**
 * Google browser auth via Google Identity Services (GIS) token client.
 *
 * IMPORTANT LIMITATION: the browser token client issues ~1h access tokens and
 * **never a refresh token** (by Google's design). Silent renewal via
 * `prompt: ''` works only while the user's Google session cookie is alive; it
 * cannot refresh with the tab closed. True offline access / Pub/Sub push
 * requires the server code flow (client secret) — the "server sliver" noted in
 * the plan. This provider covers the live-session case.
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

export function createGoogleProvider(opts: GisOptions): TokenProvider {
  let client: google.accounts.oauth2.TokenClient | null = null;
  let token: string | null = null;
  let expiresAt = 0; // epoch ms
  let email: string | null = null;

  // The token client delivers results through a single callback; route each
  // requestAccessToken() call to its own promise via this pending pointer.
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
          pending?.resolve(resp.access_token);
        }
        pending = null;
      },
    });
  }

  function request(prompt: '' | 'consent'): Promise<string> {
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      client!.requestAccessToken({ prompt });
    });
  }

  async function fetchEmail(accessToken: string) {
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok) email = ((await r.json()) as { email?: string }).email ?? null;
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
      // GIS keeps the token in memory only (no refresh token), so there is
      // nothing to rehydrate on load — the user re-clicks Connect.
      return false;
    },

    isSignedIn() {
      return token != null;
    },

    async getAccessToken() {
      await ensureClient();
      if (token && Date.now() < expiresAt) return token;
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
    },
  };
}
