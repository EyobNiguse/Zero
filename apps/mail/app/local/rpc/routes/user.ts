import * as store from '../local-store';
import { localSignOut } from '../bridge';
import { publicProcedure, router } from '../trpc';

export const userRouter = router({
  getIntercomToken: publicProcedure.query(() => null),

  // No server account exists in local mode, so "delete account" is: revoke the token and destroy
  // every trace on this device — the mirror, the caches, and the settings/templates/notes that
  // sign-out deliberately keeps.
  delete: publicProcedure.mutation(async () => {
    store.clearAll();
    await localSignOut();
    return { success: true, message: '' };
  }),
});
