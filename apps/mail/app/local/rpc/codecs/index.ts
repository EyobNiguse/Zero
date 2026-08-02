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
