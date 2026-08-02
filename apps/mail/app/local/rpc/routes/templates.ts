import { z } from 'zod';
import * as store from '../local-store';
import { publicProcedure, router } from '../trpc';

export const templatesRouter = router({
  list: publicProcedure.query(() => ({ templates: store.listTemplates() })),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        subject: z.string().default(''),
        body: z.string().default(''),
        to: z.array(z.string()).optional(),
        cc: z.array(z.string()).optional(),
        bcc: z.array(z.string()).optional(),
      }),
    )
    .mutation(({ input }) => ({
      template: store.createTemplate(input, new Date().toISOString()),
    })),

  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    store.deleteTemplate(input.id);
    return { success: true };
  }),
});
