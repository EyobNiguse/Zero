import { setActiveProvider } from './bridge';
import { getSession } from '@/lib/auth-client';
import type { TokenProvider } from '../auth';

// Intercept better-auth's session fetch (server is bypassed) and return a local
// session so the UI's `session?.user.id` gates pass. Patched once, survives
// client-side navigation (same window).
let patched = false;
export function patchSession(email: string) {
  if (patched) return;
  patched = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/api/auth/get-session')) {
      const now = new Date().toISOString();
      const user = { id: 'local', email, name: email, emailVerified: true, image: null, createdAt: now, updatedAt: now };
      const session = { id: 'local', userId: 'local', token: 'local', expiresAt: now, createdAt: now, updatedAt: now };
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
  patchSession(email);
  setActiveProvider(p);
  await getSession();
}
