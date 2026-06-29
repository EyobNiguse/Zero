import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

const createDrizzle = (d1: D1Database) => drizzle(d1, { schema });

export const createDb = (d1: D1Database) => {
  const db = createDrizzle(d1);
  // D1 has no persistent connection. `conn.end()` is a no-op shim kept so the
  // many call sites that destructure `{ db, conn }` and call `conn.end()` keep
  // working unchanged after the Postgres -> D1 migration.
  const conn = { end: async () => {} };
  return { db, conn };
};

export type DB = ReturnType<typeof createDrizzle>;
