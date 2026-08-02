/**
 * Gmail <-> mirror codec. Decodes Gmail's labels into the rows the mirror files threads under, and
 * encodes a UI label edit into what the mirror should record once the provider has accepted it.
 * Pure — types only, no client, no db.
 */
import type { Folder } from '../../db';
import type { FolderRow } from '../../db/queries';
import type { GmailLabel } from '../../mail/gmail-client';
import type { FolderRole } from '../../mail/types';
import type { PollTarget } from './index';

/** UI folder name -> the key the mirror files threads under. Real label ids pass through. */
const FOLDER_KEYS: Record<string, string> = {
  inbox: 'INBOX', sent: 'SENT', draft: 'DRAFT', drafts: 'DRAFT',
  spam: 'SPAM', bin: 'TRASH', trash: 'TRASH',
  archive: 'archive',
  important: 'IMPORTANT', starred: 'STARRED',
};

/** Gmail system-label id -> navigable folder role. */
const ROLES: Record<string, FolderRole> = {
  INBOX: 'inbox',
  SENT: 'sent',
  DRAFT: 'drafts',
  TRASH: 'trash',
  SPAM: 'spam',
  STARRED: 'starred',
  IMPORTANT: 'important',
};

const FILED = ['INBOX', 'SENT', 'SPAM', 'TRASH', 'DRAFT'];

/** The labels that behave like folders: which one a thread is in is where the UI files it. */
const FOLDER_LABELS = ['INBOX', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'archive'] as const;

/** TRASH and SPAM are views that pull a thread out of every other label; other labels stack. */
const EXCLUSIVE_DESTINATIONS = new Set(['TRASH', 'SPAM']);

const isFolder = (l: string) => (FOLDER_LABELS as readonly string[]).includes(l);

export function folderKey(name: string | undefined): string {
  const raw = name ?? 'inbox';
  return FOLDER_KEYS[raw.toLowerCase()] ?? raw;
}

export function mirrorLabels(labelIds: string[], listedUnder?: string): string[] {
  const out = new Set(labelIds);
  if (listedUnder) out.add(listedUnder);
  if (FILED.some((l) => out.has(l))) out.delete('archive');
  else out.add('archive');
  return [...out];
}


export function pollTargets(folders: Folder[]): PollTarget[] {
  return folders.filter((f) => f.role === 'inbox').map((f) => ({ folder: f, folderKey: null }));
}

export function toFolderRows(labels: GmailLabel[]): FolderRow[] {
  // Keep user labels + folder-like system labels; drop internal ones (CATEGORY_*, CHAT, UNREAD).
  const usable = labels.filter((l) => l.type === 'user' || l.id in ROLES);
  const idByPath = new Map<string, string>();
  const rows: FolderRow[] = [];

  const parentOf = (segments: string[]): string | null =>
    segments.length > 1 ? (idByPath.get(segments.slice(0, -1).join('/')) ?? null) : null;

  for (const label of [...usable].sort(
    (a, b) => a.name.split('/').length - b.name.split('/').length,
  )) {
    const segments = label.name.split('/');

    // Fill in any ancestor path that has no label of its own, shallowest first.
    for (let i = 1; i < segments.length; i++) {
      const path = segments.slice(0, i).join('/');
      if (idByPath.has(path)) continue;
      const parts = path.split('/');
      idByPath.set(path, `virtual:${path}`);
      rows.push({
        id: `virtual:${path}`,
        name: parts[parts.length - 1]!,
        role: null,
        parentId: parentOf(parts),
        unread: null,
        total: null,
      });
    }

    idByPath.set(label.name, label.id);
    rows.push({
      id: label.id,
      name: segments[segments.length - 1]!,
      role: ROLES[label.id] ?? null,
      parentId: parentOf(segments),
      unread: label.messagesUnread ?? null,
      total: label.messagesTotal ?? null,
    });
  }

  return rows;
}

export function mirrorEdit(
  add: string[],
  remove: string[],
): { add: string[]; remove: string[]; folderMove: boolean } {
  const dest = add.find(isFolder);
  const exclusive = dest != null && EXCLUSIVE_DESTINATIONS.has(dest);
  return {
    add,
    remove: exclusive
      ? [...new Set([...remove, ...FOLDER_LABELS.filter((f) => f !== dest)])]
      : remove,
    folderMove: add.some(isFolder) || remove.some(isFolder),
  };
}

export const googleCodec = {
  id: 'google' as const,
  /** Gmail hands back a thread's complete label set, so a mirror write replaces rather than merges. */
  replaceLabels: true,
  folderKey,
  mirrorLabels,
  mirrorEdit,
  pollTargets,
};
