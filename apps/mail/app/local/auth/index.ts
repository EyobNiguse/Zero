/**
 * Browser auth entry. Selects a concrete provider from Vite env:
 *   VITE_GOOGLE_CLIENT_ID   — GIS token client (public OAuth client id)
 *   VITE_MS_CLIENT_ID       — Azure SPA app registration client id
 */
export * from './types';
export { createMicrosoftProvider, type MsalOptions } from './msal';
export { createGoogleProvider, type GisOptions } from './gis';

import { createMicrosoftProvider } from './msal';
import { createGoogleProvider } from './gis';
import type { ProviderId, TokenProvider } from './types';

export function createTokenProvider(provider: ProviderId): TokenProvider {
  if (provider === 'microsoft') {
    const clientId = import.meta.env.VITE_MS_CLIENT_ID;
    if (!clientId) throw new Error('VITE_MS_CLIENT_ID is not set');
    return createMicrosoftProvider({ clientId });
  }
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not set');
  return createGoogleProvider({ clientId });
}
