import { type auth } from '@/lib/auth';
import { type db } from '@zero/db';

export type HonoVariables = {
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
  db: typeof db;
};
