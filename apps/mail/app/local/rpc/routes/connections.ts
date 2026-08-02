import { z } from 'zod';
import { getTokenProvider, localSignOut } from '../bridge';
import { publicProcedure, router } from '../trpc';

const connection = () => {
  const p = getTokenProvider();
  if (!p) return null;
  const email = p.getEmail() ?? '';
  return { id: 'local', email, name: email, picture: null, providerId: p.provider };
};

export const connectionsRouter = router({
  // Shape must match the server: { connections, disconnectedIds } — NavUser reads .connections.
  list: publicProcedure.query(() => {
    const c = connection();
    return {
      connections: c ? [{ ...c, createdAt: null }] : [],
      disconnectedIds: [],
    };
  }),

  getDefault: publicProcedure.query(() => connection()),

  // One connection in local mode — nothing to switch; no-op.
  setDefault: publicProcedure
    .input(z.object({ connectionId: z.string() }).optional())
    .mutation(() => ({ success: true })),

  // Disconnect the account: revoke, wipe the mirror, clear flags, fall back to login.
  delete: publicProcedure
    .input(z.object({ connectionId: z.string() }).optional())
    .mutation(async () => {
      await localSignOut();
      return { success: true };
    }),
});
