import { setActiveProvider } from './bridge';
import { getSession } from '@/lib/auth-client';
import { resetSyncState } from './sync-state';
import type { TokenProvider } from '../auth';

// Intercept better-auth's session fetch and return a local session so UI gates pass. Installed once; reads email from localStorage per call.
let patched = false;
export function installLocalSessionPatch() {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/api/auth/get-session')) {
      const email = localStorage.getItem('local.email') || 'local@local';
      const now = new Date().toISOString();
      // Far-future expiry — "now" reads as already-expired and better-auth drops the session.
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const user = { id: 'local', email, name: email, emailVerified: true, image: null, createdAt: now, updatedAt: now };
      const session = { id: 'local', userId: 'local', token: 'local', expiresAt, createdAt: now, updatedAt: now };
      return new Response(JSON.stringify({ user, session }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return orig(input, init);
  };
}

/** Register the signed-in provider as the local backend + seed the session. */
export async function activateLocal(p: TokenProvider) {
  const email = p.getEmail() ?? 'local@local';
  // Surface the connected identity to the landing page ("Continue to <email>").
  localStorage.setItem('local.email', email);
  installLocalSessionPatch();
  setActiveProvider(p);
  // Fresh login: drop stale sync timestamps so the first read re-syncs.
  resetSyncState();
  await getSession();
}
