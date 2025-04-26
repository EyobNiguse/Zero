import { activeConnectionProcedure, ensureBrainAvailableMiddleware, router } from '../trpc';
import { disableBrainFunction, enableBrainFunction } from '@/lib/brain';
import { z } from 'zod';

export const brainRouter = router({
  enableBrain: activeConnectionProcedure
    .input(
      z.object({
        connection: z
          .object({
            id: z.string(),
            providerId: z.string(),
          })
          .optional(),
      }),
    )
    .use(ensureBrainAvailableMiddleware)
    .mutation(async ({ ctx, input }) => {
      let { connection } = input;
      if (!connection) connection = ctx.activeConnection;
      return await enableBrainFunction(connection);
    }),
  disableBrain: activeConnectionProcedure
    .input(
      z.object({
        connection: z
          .object({
            id: z.string(),
            providerId: z.string(),
          })
          .optional(),
      }),
    )
    .use(ensureBrainAvailableMiddleware)
    .mutation(async ({ ctx, input }) => {
      let { connection } = input;
      if (!connection) connection = ctx.activeConnection;
      return await disableBrainFunction(connection);
    }),

  generateSummary: activeConnectionProcedure
    .use(ensureBrainAvailableMiddleware)
    .input(
      z.object({
        threadId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const { threadId } = input;
      const response = await fetch(
        process.env.BRAIN_URL + `/brain/thread/summary/${threadId}`,
      ).then((res) => res.json());
      return (response as { short: string }) ?? null;
    }),
  getState: activeConnectionProcedure.use(ensureBrainAvailableMiddleware).query(async ({ ctx }) => {
    const connection = ctx.activeConnection;
    const response = await fetch(process.env.BRAIN_URL + `/limit/${connection.id}`).then((res) =>
      res.json(),
    );
    return (response as { enabled: boolean }) ?? null;
  }),
});
