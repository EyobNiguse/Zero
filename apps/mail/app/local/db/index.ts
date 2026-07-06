/**
 * Local browser SQLite — public entry.
 *
 *   import { getLocalDB, list } from '~/local/db';
 *   const db = await getLocalDB();
 *   const threads = await list(db);   // reads straight from OPFS, no network
 */
export { getLocalDB, type LocalDB } from './client';
export * as schema from './schema';
export * from './queries';

import { getLocalDB } from './client';
import { list, countThreads } from './queries';

/**
 * Step 1 acceptance probe. Boots the DB, applies bootstrap DDL, runs a read.
 * Returns the current thread count (0 on a fresh mirror). Call it from the
 * browser console during dev to confirm the driver is wired:
 *
 *   import('~/local/db').then((m) => m.localDbSelfTest()).then(console.log)
 */
export async function localDbSelfTest(): Promise<{ ok: boolean; count: number }> {
  const db = await getLocalDB();
  const rows = await list(db); // proves SELECT + ordering path
  const count = await countThreads(db); // proves aggregate path
  return { ok: Array.isArray(rows), count };
}
