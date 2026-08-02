import { userSettingsSchema } from '@zero/server/schemas';
import * as store from '../local-store';
import { publicProcedure, router } from '../trpc';

// Browser-only user data (settings/templates/notes) in localStorage. See ../local-store.
export const settingsRouter = router({
  get: publicProcedure.query(() => ({ settings: store.getSettings() })),

  // The schema's `.partial()` still applies each field's own defaults — a category saved without
  // `isDefault` would otherwise keep it undefined.
  save: publicProcedure.input(userSettingsSchema.partial()).mutation(({ input }) => ({
    success: true,
    settings: store.saveSettings(input),
  })),
});
