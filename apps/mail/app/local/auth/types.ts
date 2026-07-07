/**
 * Provider-agnostic browser auth.
 *
 * A TokenProvider owns the OAuth dance for one provider entirely in the
 * browser (PKCE, no client secret) and hands out short-lived access tokens.
 * The mail drivers depend only on this interface, never on a concrete SDK.
 */
export type ProviderId = 'google' | 'microsoft';

export interface TokenProvider {
  readonly provider: ProviderId;

  /**
   * Interactive sign-in. Popup providers resolve once an account is
   * established; a redirect provider navigates the tab away and never resolves
   * (the page reloads and `restoreSession` completes it).
   */
  signIn(): Promise<void>;

  /**
   * Complete a returning redirect sign-in and/or rehydrate an existing session
   * on page load. Resolves true if an account is now available. Popup providers
   * with no persisted session just return false.
   */
  restoreSession(): Promise<boolean>;

  /** True if there is a usable account (may still need a silent token refresh). */
  isSignedIn(): boolean;

  /**
   * Return a valid access token, refreshing silently if possible. Rejects if
   * interactive sign-in is required (caller should surface a re-login prompt).
   */
  getAccessToken(): Promise<string>;

  /** The signed-in account's primary email, if known. */
  getEmail(): string | null;

  signOut(): Promise<void>;
}
