/**
 * Microsoft browser auth via MSAL.js — full PKCE, no backend.
 *
 * Uses the REDIRECT flow, not popup: `loginRedirect` navigates the whole tab to
 * Microsoft and back to `/local`, where `handleRedirectPromise` (in ensureInit)
 * completes sign-in on load. Popup flow proved unreliable here — the opener
 * couldn't read the code back, so the popup hung on the redirect page.
 *
 * Requires an Azure app registration with the **SPA** platform (redirect URI =
 * `<origin>/local`), which enables PKCE + SPA refresh tokens. `acquireTokenSilent`
 * then renews access tokens without a round trip.
 */
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
  type AuthenticationResult,
  type Configuration,
} from '@azure/msal-browser';
import type { TokenProvider } from './types';

// Graph scopes — mirror the server's Microsoft scopes (auth-providers.ts).
const SCOPES = ['Mail.ReadWrite', 'Mail.Send', 'User.Read', 'offline_access'];

export interface MsalOptions {
  clientId: string;
  /** 'common' (multi-tenant + personal) unless you need a specific tenant. */
  authority?: string;
  redirectUri?: string;
}

export function createMicrosoftProvider(opts: MsalOptions): TokenProvider {
  const config: Configuration = {
    auth: {
      clientId: opts.clientId,
      authority: opts.authority ?? 'https://login.microsoftonline.com/common',
      // Return to /local so the app remounts here and completes the redirect.
      redirectUri: opts.redirectUri ?? `${window.location.origin}/local`,
    },
    // sessionStorage, not localStorage — smaller XSS blast radius.
    cache: { cacheLocation: 'sessionStorage' },
  };

  const msal = new PublicClientApplication(config);
  let initialized = false;
  let account: AccountInfo | null = null;

  async function ensureInit() {
    if (initialized) return;
    await msal.initialize();
    // Processes the auth code when the tab returns from loginRedirect; resolves
    // null on a normal load. Also clears any stale interaction state.
    const result: AuthenticationResult | null = await msal
      .handleRedirectPromise()
      .catch(() => null);
    if (result?.account) msal.setActiveAccount(result.account);
    account = msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null;
    initialized = true;
  }

  return {
    provider: 'microsoft',

    async signIn() {
      await ensureInit();
      // Navigates the whole tab to Microsoft; this call does not return — the
      // page reloads at redirectUri and restoreSession() finishes the job.
      await msal.loginRedirect({ scopes: SCOPES });
    },

    async restoreSession() {
      await ensureInit();
      return account != null;
    },

    isSignedIn() {
      return account != null;
    },

    async getAccessToken() {
      await ensureInit();
      if (!account) throw new Error('microsoft: not signed in');
      try {
        const res = await msal.acquireTokenSilent({ scopes: SCOPES, account });
        return res.accessToken;
      } catch (err) {
        if (err instanceof InteractionRequiredAuthError) {
          const res = await msal.acquireTokenPopup({ scopes: SCOPES, account });
          return res.accessToken;
        }
        throw err;
      }
    },

    getEmail() {
      return account?.username ?? null;
    },

    async signOut() {
      await ensureInit();
      if (account) await msal.logoutPopup({ account });
      account = null;
    },
  };
}
