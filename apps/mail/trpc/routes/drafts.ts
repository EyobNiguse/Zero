import { activeDriverProcedure, router } from '../trpc';
import { z } from 'zod';

export const draftsRouter = router({
  // TODO: figure out the types
  create: activeDriverProcedure.input(z.unknown()).mutation(async ({ input, ctx }) => {
    const { driver } = ctx;
    return driver.createDraft(input);
  }),
  get: activeDriverProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const { driver } = ctx;
    const { id } = input;
    return driver.getDraft(id);
  }),
  list: activeDriverProcedure
    .input(
      z.object({
        q: z.string().optional(),
        max: z.number().optional(),
        pageToken: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { driver } = ctx;
      const { q, max, pageToken } = input;
      return driver.listDrafts(q, max, pageToken);
    }),
});
