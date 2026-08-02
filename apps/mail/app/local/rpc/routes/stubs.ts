import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

/**
 * Namespaces with no local equivalent — they need the backend's own credentials (AI models, BIMI
 * lookups, calendar). Benign shapes so the UI renders empty instead of erroring.
 *
 * Inputs are `z.any()` on purpose: these ignore what they're given, so a schema would only be a
 * second thing to keep in sync with the caller.
 */
const anyInput = z.any().optional();

export const aiRouter = router({
  compose: publicProcedure.input(anyInput).mutation(() => ({ newBody: '' })),
  generateEmailSubject: publicProcedure.input(anyInput).mutation(() => ({ subject: '' })),
  generateSearchQuery: publicProcedure.input(anyInput).mutation(() => ({ query: '' })),
  webSearch: publicProcedure.input(anyInput).mutation(() => ({ sources: [] })),
});

/** BIMI logos are resolved server-side; null falls back to the avatar initials. */
export const bimiRouter = router({
  getByEmail: publicProcedure.input(anyInput).query(() => null),
});

/** Stubbed off so the UI reads a disabled brain rather than a failed call. */
export const brainRouter = router({
  getLabels: publicProcedure.input(anyInput).query(() => []),
  getPrompts: publicProcedure.query(() => []),
  getState: publicProcedure.query(() => ({ enabled: false })),
  // AiSummary reads summary.data.short — return {data:{...}} so it renders nothing.
  generateSummary: publicProcedure.input(anyInput).query(() => ({ data: { short: '', long: '' } })),
  updateLabels: publicProcedure.input(anyInput).mutation(() => ({ success: true })),
  enableBrain: publicProcedure.mutation(() => ({ success: true })),
  disableBrain: publicProcedure.mutation(() => ({ success: true })),
  updatePrompt: publicProcedure.input(anyInput).mutation(() => ({ success: true })),
});

/** Meeting creation needs the backend's calendar credentials; no local path. */
export const meetRouter = router({
  create: publicProcedure.input(anyInput).mutation(() => null),
});
