/**
 * Picks the signed-in provider's codec — the translation between that provider's way of organising
 * mail and the mirror's, which is labels all the way down.
 *
 * The codecs are pure data and pure functions, so this is a lookup, not a factory: nothing to build,
 * nothing to cache, nothing to invalidate on reconnect. The fetching and the SQLite writes that use
 * them live in ../local-utils.
 */
import type { Folder } from '../../db';
import { getTokenProvider } from '../bridge';
import { googleCodec } from './google';
import { microsoftCodec } from './microsoft';

/** One folder to delta-poll. `folderKey` is null where the provider's delta is mailbox-wide. */
export interface PollTarget {
  folder: Folder;
  folderKey: string | null;
}

export type Codec = typeof googleCodec | typeof microsoftCodec;

export function codec(): Codec {
  const token = getTokenProvider();
  if (!token) throw new Error('local mail: not signed in');
  return token.provider === 'microsoft' ? microsoftCodec : googleCodec;
}
