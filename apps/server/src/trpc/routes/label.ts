import { activeDriverProcedure, createRateLimiterMiddleware, router } from '../trpc';
import { getZeroAgent } from '../../lib/server-utils';
import { Ratelimit } from '@upstash/ratelimit';
import { z } from 'zod';

// Nesting, role and counts are populated by the browser-local resolver (which serves the folder
// tree out of SQLite). Server mode returns a flat list and leaves them undefined.
interface LabelNode {
  id: string;
  name: string;
  color?: { backgroundColor: string; textColor: string };
  type: string;
  role?: string | null;
  unread?: number;
  total?: number;
  labels?: LabelNode[];
}

const labelSchema: z.ZodType<LabelNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    color: z
      .object({
        backgroundColor: z.string(),
        textColor: z.string(),
      })
      .optional(),
    type: z.string(),
    role: z.string().nullable().optional(),
    unread: z.number().optional(),
    total: z.number().optional(),
    labels: z.array(labelSchema).optional(),
  }),
);

export const labelsRouter = router({
  list: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        generatePrefix: ({ sessionUser }) => `ratelimit:get-labels-${sessionUser?.id}`,
        limiter: Ratelimit.slidingWindow(120, '1m'),
      }),
    )
    .output(z.array(labelSchema))
    .query(async ({ ctx }) => {
      const { activeConnection } = ctx;
      const { stub: agent } = await getZeroAgent(activeConnection.id);
      return await agent.getUserLabels();
    }),
  create: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        generatePrefix: ({ sessionUser }) => `ratelimit:labels-post-${sessionUser?.id}`,
        limiter: Ratelimit.slidingWindow(60, '1m'),
      }),
    )
    .input(
      z.object({
        name: z.string(),
        color: z
          .object({
            backgroundColor: z.string(),
            textColor: z.string(),
          })
          .default({
            backgroundColor: '',
            textColor: '',
          }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { activeConnection } = ctx;
      const { stub: agent } = await getZeroAgent(activeConnection.id);
      const label = {
        ...input,
        type: 'user',
      };
      return await agent.createLabel(label);
    }),
  update: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        generatePrefix: ({ sessionUser }) => `ratelimit:labels-patch-${sessionUser?.id}`,
        limiter: Ratelimit.slidingWindow(60, '1m'),
      }),
    )
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.string().optional(),
        color: z
          .object({
            backgroundColor: z.string(),
            textColor: z.string(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { activeConnection } = ctx;
      const { stub: agent } = await getZeroAgent(activeConnection.id);
      const { id, ...label } = input;
      return await agent.updateLabel(id, label);
    }),
  delete: activeDriverProcedure
    .use(
      createRateLimiterMiddleware({
        generatePrefix: ({ sessionUser }) => `ratelimit:labels-delete-${sessionUser?.id}`,
        limiter: Ratelimit.slidingWindow(60, '1m'),
      }),
    )
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { activeConnection } = ctx;
      const { stub: agent } = await getZeroAgent(activeConnection.id);
      return await agent.deleteLabel(input.id);
    }),
});
