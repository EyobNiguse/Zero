import { privateProcedure, router } from '../trpc';
import { auth } from '@/lib/auth';

export const userRouter = router({
  delete: privateProcedure.mutation(async ({ ctx }) => {
    const { success, message } = await auth.api.deleteUser({
      body: {
        callbackURL: '/',
      },
      headers: ctx.c.req.raw.headers,
    });
    return { success, message };
  }),
});
