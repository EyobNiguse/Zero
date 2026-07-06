/** Mail driver entry — build the right driver for a provider + token source. */
export * from './types';
export { createGmailDriver } from './gmail';
export { createGraphDriver } from './graph';

import { createGmailDriver } from './gmail';
import { createGraphDriver } from './graph';
import type { MailDriver } from './types';
import type { TokenProvider } from '../auth/types';

export function createMailDriver(auth: TokenProvider, providerId: string): MailDriver {
  return auth.provider === 'microsoft'
    ? createGraphDriver(auth, providerId)
    : createGmailDriver(auth, providerId);
}
