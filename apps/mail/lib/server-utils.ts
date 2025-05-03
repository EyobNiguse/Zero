import { connection } from '@zero/db/schema';
import { HonoVariables } from '@/trpc/hono';
import { createDriver } from './driver';
import { and, eq } from 'drizzle-orm';
import { Context } from 'hono';

export const getActiveConnection = async (c: Context<{ Variables: HonoVariables }>) => {
  const { session, db } = c.var;
  if (!session?.user) throw new Error('Session Not Found');
  if (!session.connectionId) throw new Error('No active connection found for the user');

  const activeConnection = await db.query.connection.findFirst({
    where: and(eq(connection.userId, session.user.id), eq(connection.id, session.connectionId)),
  });

  if (!activeConnection) throw new Error('Active connection not found');

  if (!activeConnection.refreshToken || !activeConnection.accessToken)
    throw new Error(
      'Active Connection is not properly authorized, please reconnect the connection',
    );
  return activeConnection;
};

export const connectionToDriver = async (activeConnection: typeof connection.$inferSelect) => {
  const driver = await createDriver(activeConnection.providerId, {
    auth: {
      access_token: activeConnection.accessToken,
      refresh_token: activeConnection.refreshToken!,
      email: activeConnection.email,
    },
  });
  return driver;
};
