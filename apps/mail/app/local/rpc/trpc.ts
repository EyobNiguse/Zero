/**
 * Local tRPC setup — the browser-side counterpart to apps/server/src/trpc/trpc.ts.
 *
 * Procedures run in-process via createCaller (see ./local-link); there is no transport, so no
 * transformer is configured. What this buys over the flat resolver map it replaces: Zod parses the
 * input, the middleware chain supplies ctx, and errors carry real TRPCError codes.
 */
import { initTRPC, TRPCError } from '@trpc/server';
import type { LocalDB } from '../db';
import type { MailDriver } from '../mail';
import { getActiveDriver, getTokenProvider, getLocalDB, whenActive } from './bridge';
import { codec, type Codec } from './codecs';

export interface LocalContext {
  db: LocalDB;
  /** Translation between the signed-in provider's mailbox model and the mirror's — see ./codecs. */
  codec: Codec;
  driver: MailDriver;
}

const t = initTRPC.create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** No mirror, no provider — the localStorage-backed and stubbed procedures. */
export const publicProcedure = t.procedure;

/** Anything that reads or writes the mirror. Boots the SQLite worker on first use. */
export const dbProcedure = publicProcedure.use(async ({ next }) =>
  next({ ctx: { db: await getLocalDB() } }),
);

/**
 * Anything that talks to the provider. On a reload React Query fires before LocalMode has restored
 * the session, so this waits for activation (bounded — see whenActive) instead of racing an absent
 * driver. That wait used to be hand-rolled around every call in ./local-link.
 */
export const driverProcedure = dbProcedure.use(async ({ next }) => {
  try {
    await whenActive();
  } catch (err) {
    throw new TRPCError({ code: 'TIMEOUT', message: (err as Error).message, cause: err });
  }

  if (!getTokenProvider()) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'local mail: not signed in' });
  }
  return next({ ctx: { codec: codec(), driver: getActiveDriver() } });
});
