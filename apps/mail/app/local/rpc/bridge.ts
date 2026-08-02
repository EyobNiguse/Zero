import type { TokenProvider } from '../auth';
import { createMailDriver, type MailDriver } from '../mail';
import { createGmailClient, type GmailClient } from '../mail/gmail-client';
import { createGraphClient, type GraphClient } from '../mail/graph-client';
import { getLocalDB, clearMirror, type LocalDB } from '../db';
import { clear as idbClear } from 'idb-keyval';

let provider: TokenProvider | null = null;
let driver: MailDriver | null = null;
/** The raw transport, for the few reads whose shape the driver has no reason to normalize. */
let client: GmailClient | GraphClient | null = null;
interface Waiter {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
let activeWaiters: Waiter[] = [];

/** How long a caller waits for activation before giving up. */
const ACTIVATION_TIMEOUT_MS = 15_000;

function settleWaiters(err: Error | null): void {
  const waiters = activeWaiters;
  activeWaiters = [];
  for (const w of waiters) {
    clearTimeout(w.timer);
    if (err) w.reject(err);
    else w.resolve();
  }
}

export function setActiveProvider(p: TokenProvider | null) {
  provider = p;
  driver = p ? createMailDriver(p, p.provider) : null;
  client = p ? (p.provider === 'microsoft' ? createGraphClient(p) : createGmailClient(p)) : null;
  settleWaiters(driver ? null : new Error('local mail: activation cancelled'));
}

/** The OAuth token source. For the signed-in provider's naming and rules, see ./providers. */
export function getTokenProvider(): TokenProvider | null {
  return provider;
}

export function getActiveDriver(): MailDriver {
  if (!driver) throw new Error('local mail: not signed in');
  return driver;
}

export function getActiveClient(): GmailClient | GraphClient {
  if (!client) throw new Error('local mail: not signed in');
  return client;
}

export function isLocalActive(): boolean {
  return driver != null;
}

export function isLocalPending(): boolean {
  return typeof window !== 'undefined' && !!localStorage.getItem('local.provider') && driver == null;
}

export function whenActive(): Promise<void> {
  if (driver != null) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      activeWaiters = activeWaiters.filter((w) => w.timer !== timer);
      reject(new Error('local mail: activation timed out'));
    }, ACTIVATION_TIMEOUT_MS);
    activeWaiters.push({ resolve, reject, timer });
  });
}

export async function localSignOut(): Promise<void> {
  try {
    await provider?.signOut();
  } catch {
    /* revoke is best-effort */
  }
  setActiveProvider(null);
  try {
    // Drops sync_state along with the rest of the mirror.
    await clearMirror(await getLocalDB());
  } catch {
    /* mirror may be empty / uninitialised */
  }
  // Drop the persisted react-query cache too — keyed by a null connectionId, so accounts would otherwise bleed.
  try {
    await idbClear();
  } catch {
    /* no persisted cache yet */
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem('local.provider');
    localStorage.removeItem('local.email');
    localStorage.removeItem('local.google.session');
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('msal.') || key.includes('login.windows.net')) {
        localStorage.removeItem(key);
      }
    }
  }
}

export { getLocalDB };
export type { LocalDB, MailDriver };
