/**
 * Microsoft browser auth via MSAL.js — full PKCE, no backend.
 * Uses the redirect flow (loginRedirect + handleRedirectPromise); requires an Azure SPA app registration.
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

// Module singleton: separate PublicClientApplication instances race on handleRedirectPromise and drop the auth code.
let sharedApp: PublicClientApplication | null = null;
let sharedInit: Promise<void> | null = null;

function getApp(opts: MsalOptions): PublicClientApplication {
  if (sharedApp) return sharedApp;
  const config: Configuration = {
    auth: {
      clientId: opts.clientId,
      authority: opts.authority ?? 'https://login.microsoftonline.com/common',
      // Return to /mail so LocalMode completes the redirect and restores the session.
      redirectUri: opts.redirectUri ?? `${window.location.origin}/mail/inbox`,
    },
    // localStorage so the account survives a tab close / refresh (restored by LocalMode).
    cache: { cacheLocation: 'localStorage' },
  };
  sharedApp = new PublicClientApplication(config);
  return sharedApp;
}

export function createMicrosoftProvider(opts: MsalOptions): TokenProvider {
  const msal = getApp(opts);
  let account: AccountInfo | null = null;

  async function ensureInit() {
    // Shared promise: init + handleRedirectPromise run once across all instances (else interaction_in_progress).
    if (!sharedInit) {
      sharedInit = (async () => {
        await msal.initialize();
        // navigateToLoginRequestUrl:false keeps the tab on the redirect URI instead of bouncing to /login.
        const result: AuthenticationResult | null = await msal
          .handleRedirectPromise({ navigateToLoginRequestUrl: false })
          .catch(() => null);
        if (result?.account) msal.setActiveAccount(result.account);
      })();
    }
    await sharedInit;
    account = msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null;
  }

  return {
    provider: 'microsoft',

    async signIn() {
      await ensureInit();
      // Navigates the whole tab to Microsoft; does not return — restoreSession() finishes after reload.
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
      // Clear cached tokens/accounts locally — no popup/redirect (they get blocked and leave the token behind).
      try {
        await msal.clearCache();
      } catch {
        /* best-effort */
      }
      account = null;
    },
  };
}
