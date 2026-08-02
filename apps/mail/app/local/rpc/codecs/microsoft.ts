/**
 * Graph <-> mirror codec. Decodes Graph's folders and categories into the rows the mirror files
 * threads under, and encodes a UI label edit — which arrives in Gmail's vocabulary — into what the
 * mirror should record once the provider has accepted it. Pure — types only, no client, no db.
 */
import type { Folder } from '../../db';
import type { FolderRow } from '../../db/queries';
import type { GraphFolderNode } from '../../mail/graph-client';
import type { FolderRole } from '../../mail/types';
import type { PollTarget } from './index';

/** UI folder name -> the key the mirror files threads under. Real folder ids pass through. */
const FOLDER_KEYS: Record<string, string> = {
  inbox: 'inbox', sent: 'sentitems', draft: 'drafts', drafts: 'drafts',
  spam: 'junkemail', bin: 'deleteditems', trash: 'deleteditems', archive: 'archive',
};

const FOLDER_IDS = [
  'inbox', 'sentitems', 'archive', 'junkemail', 'deleteditems', 'drafts',
] as const;

/** The UI still speaks Gmail's names for the well-known folders. */
const FROM_GMAIL_LABEL: Record<string, string> = {
  TRASH: 'deleteditems',
  SPAM: 'junkemail',
  INBOX: 'inbox',
  ARCHIVE: 'archive',
};

const POLLED_ROLES = new Set<FolderRole>(['inbox', 'sent', 'archive', 'trash', 'spam']);

const isFolder = (l: string) => (FOLDER_IDS as readonly string[]).includes(l);
const rename = (labels: string[]) => labels.map((l) => FROM_GMAIL_LABEL[l] ?? l);

export function folderKey(name: string | undefined): string {
  const raw = name ?? 'inbox';
  return FOLDER_KEYS[raw.toLowerCase()] ?? raw;
}

export function mirrorLabels(labelIds: string[], listedUnder?: string): string[] {
  const out = new Set(labelIds);
  if (listedUnder) out.add(listedUnder);
  return [...out];
}

/** Graph's delta is per-folder, so every tracked folder is polled under its own key. */
export function pollTargets(folders: Folder[]): PollTarget[] {
  return folders
    .filter((f) => f.role && POLLED_ROLES.has(f.role))
    .map((f) => ({ folder: f, folderKey: FOLDER_KEYS[f.role!] ?? f.role! }));
}

/** Graph has a real tree; walk it, carrying the parent id down. */
export function toFolderRows(nodes: GraphFolderNode[], parentId: string | null = null): FolderRow[] {
  return nodes.flatMap((f) => [
    {
      id: f.id,
      name: f.displayName ?? '',
      role: f.role,
      parentId,
      unread: f.unreadItemCount ?? null,
      total: f.totalItemCount ?? null,
    },
    ...toFolderRows(f.children, f.id),
  ]);
}

export function mirrorEdit(
  add: string[],
  remove: string[],
): { add: string[]; remove: string[]; folderMove: boolean } {
  const renamed = rename(add);
  // Archive-out (remove INBOX, no folder add) still has to land in the archive view.
  const mAdd = renamed.length === 0 && remove.includes('INBOX') ? ['archive'] : renamed;
  const mRemove = rename(remove);

  const dest = mAdd.find(isFolder);
  return {
    add: mAdd,
    remove: dest
      ? [...new Set([...mRemove, ...FOLDER_IDS.filter((f) => f !== dest)])]
      : mRemove,
    folderMove: mAdd.some(isFolder) || mRemove.some(isFolder),
  };
}

export const microsoftCodec = {
  id: 'microsoft' as const,
  replaceLabels: false,
  folderKey,
  mirrorLabels,
  mirrorEdit,
  pollTargets,
};
