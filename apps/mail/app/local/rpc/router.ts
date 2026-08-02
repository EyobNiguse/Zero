import { createCallerFactory, router } from './trpc';
import { connectionsRouter } from './routes/connections';
import { draftsRouter } from './routes/drafts';
import { labelsRouter } from './routes/label';
import { mailRouter } from './routes/mail';
import { notesRouter } from './routes/notes';
import { settingsRouter } from './routes/settings';
import { templatesRouter } from './routes/templates';
import { userRouter } from './routes/user';
import { aiRouter, bimiRouter, brainRouter, meetRouter } from './routes/stubs';

/** Every namespace the UI calls. Nothing falls through to a backend — see providers/query-provider. */
export const localRouter = router({
  ai: aiRouter,
  bimi: bimiRouter,
  brain: brainRouter,
  connections: connectionsRouter,
  drafts: draftsRouter,
  labels: labelsRouter,
  mail: mailRouter,
  meet: meetRouter,
  notes: notesRouter,
  settings: settingsRouter,
  templates: templatesRouter,
  user: userRouter,
});

export type LocalRouter = typeof localRouter;

/**
 * Base ctx is empty — dbProcedure/driverProcedure build the real one per call — so one caller does.
 * The client reaches these procedures through unstable_localLink; this is for the few callers that
 * bypass tRPC and invoke one directly, wanting their own query key (hooks/use-thread-groups.ts).
 */
export const localCaller = createCallerFactory(localRouter)({});
