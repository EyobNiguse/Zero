import type { TokenProvider } from '../auth';
import { createMailDriver, type MailDriver } from '../mail';
import { getLocalDB, clearMirror, type LocalDB } from '../db';
import { clear as idbClear } from 'idb-keyval';

let provider: TokenProvider | null = null;
let driver: MailDriver | null = null;
// Resolvers waiting for activation (see whenActive); flushed once the driver is set.
let activeWaiters: Array<() => void> = [];

export function setActiveProvider(p: TokenProvider | null) {
  provider = p;
  driver = p ? createMailDriver(p, p.provider) : null;
  if (driver && activeWaiters.length) {
    const waiters = activeWaiters;
    activeWaiters = [];
    for (const resolve of waiters) resolve();
  }
}

export function getActiveProvider(): TokenProvider | null {
  return provider;
}

export function getActiveDriver(): MailDriver {
  if (!driver) throw new Error('local mail: not signed in');
  return driver;
}

export function isLocalActive(): boolean {
  return driver != null;
}

/** Local mode selected but the driver isn't restored yet — queries should wait, not fall through. */
export function isLocalPending(): boolean {
  return typeof window !== 'undefined' && !!localStorage.getItem('local.provider') && driver == null;
}

/** Resolves as soon as a driver is active (immediately if already active). */
export function whenActive(): Promise<void> {
  if (driver != null) return Promise.resolve();
  return new Promise((resolve) => activeWaiters.push(resolve));
}

/** Full local sign-out: revoke token, drop driver, wipe mirror, clear flags + cached session. */
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
    // Backstop: purge any leftover MSAL token cache so a refresh can't restore the session.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('msal.') || key.includes('login.windows.net')) {
        localStorage.removeItem(key);
      }
    }
  }
}

export { getLocalDB };
export type { LocalDB, MailDriver };
