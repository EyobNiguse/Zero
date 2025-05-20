import { lazy, type inferRouterInputs, type inferRouterOutputs } from '@trpc/server';
import { getContext } from 'hono/context-storage';
import type { HonoContext } from '../ctx';
import { router } from './trpc';

export const appRouter = router({
  ai: lazy(() => import('./routes/ai').then((m) => m.aiRouter)),
  brain: lazy(() => import('./routes/brain').then((m) => m.brainRouter)),
  connections: lazy(() => import('./routes/connections').then((m) => m.connectionsRouter)),
  cookiePreferences: lazy(() => import('./routes/cookies').then((m) => m.cookiePreferencesRouter)),
  drafts: lazy(() => import('./routes/drafts').then((m) => m.draftsRouter)),
  labels: lazy(() => import('./routes/label').then((m) => m.labelsRouter)),
  mail: lazy(() => import('./routes/mail').then((m) => m.mailRouter)),
  notes: lazy(() => import('./routes/notes').then((m) => m.notesRouter)),
  shortcut: lazy(() => import('./routes/shortcut').then((m) => m.shortcutRouter)),
  settings: lazy(() => import('./routes/settings').then((m) => m.settingsRouter)),
  user: lazy(() => import('./routes/user').then((m) => m.userRouter)),
});

export type AppRouter = typeof appRouter;

export type Inputs = inferRouterInputs<AppRouter>;
export type Outputs = inferRouterOutputs<AppRouter>;

export const serverTrpc = () => {
  const c = getContext<HonoContext>();
  return appRouter.createCaller({
    c,
    session: c.var.session,
    db: c.var.db,
    auth: c.var.auth,
    autumn: c.var.autumn,
  });
};
