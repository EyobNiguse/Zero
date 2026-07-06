import type { TokenProvider } from '../auth';
import { createMailDriver, type MailDriver } from '../mail';
import { getLocalDB, type LocalDB } from '../db';

let provider: TokenProvider | null = null;
let driver: MailDriver | null = null;

export function setActiveProvider(p: TokenProvider | null) {
  provider = p;
  driver = p ? createMailDriver(p, p.provider) : null;
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

export { getLocalDB };
export type { LocalDB, MailDriver };
