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
import { list, countThreads, getFolders } from './queries';
import { folders as foldersTable } from './schema';

/**
 * Dev probe:  import('~/local/db').then((m) => m.localDbSelfTest()).then(console.log)
 *
 * `foldersNamed` must be > 0 — folders whose name is still the raw provider id were never
 * hydrated from listFolders().
 */
export async function localDbSelfTest(providerId?: string): Promise<{
  ok: boolean;
  count: number;
  folders: number;
  foldersNamed: number;
}> {
  const db = await getLocalDB();
  const rows = await list(db);
  const count = await countThreads(db);

  const all = providerId ? await getFolders(db, providerId) : await db.select().from(foldersTable);

  return {
    ok: Array.isArray(rows),
    count,
    folders: all.length,
    foldersNamed: all.filter((f) => f.name !== f.id).length,
  };
}
