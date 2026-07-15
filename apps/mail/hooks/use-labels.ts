import { useTRPC } from '@/providers/query-provider';
import { useQuery } from '@tanstack/react-query';
import type { Label } from '@/types';
import { useMemo } from 'react';

const desiredSystemLabels = new Set([
  'IMPORTANT',
  'FORUMS',
  'PROMOTIONS',
  'SOCIAL',
  'UPDATES',
  'STARRED',
  'UNREAD',
]);

export function useLabels() {
  const trpc = useTRPC();
  const labelQuery = useQuery(
    trpc.labels.list.queryOptions(void 0, {
      staleTime: 1000 * 60 * 60, // 1 hour
    }),
  );

  const { userLabels, systemLabels, folderLabels } = useMemo(() => {
    if (!labelQuery.data) return { userLabels: [], systemLabels: [], folderLabels: [] };
    const cleanedName = labelQuery.data
      .filter((label) => label.type === 'system')
      .map((label) => {
        return {
          ...label,
          name: label.name.replace('CATEGORY_', ''),
        };
      });
    const cleanedSystemLabels = cleanedName.filter((label) => desiredSystemLabels.has(label.name));
    return {
      userLabels: labelQuery.data.filter((label) => label.type === 'user'),
      systemLabels: cleanedSystemLabels,
      // The sidebar's folder list: role folders repeat here despite having a static nav entry. Kept
      // out of `userLabels`, which feeds thread chips and the label manager — neither should offer
      // Inbox as a label to apply or a folder to delete.
      folderLabels: labelQuery.data.filter((label) => label.type === 'user' || label.role),
    };
  }, [labelQuery.data]);

  return { userLabels, systemLabels, folderLabels, ...labelQuery };
}

/**
 * Subfolders of role folders, keyed by role ('inbox' -> [Receipts, Newsletters]).
 *
 * Outlook nests user folders under Inbox/Archive/Sent routinely. Those can't live in the
 * `userLabels` tree — their parent is a system folder, which useLabels filters out — so the
 * static nav hangs them off the matching nav item instead. Empty on providers that don't nest.
 */
export function useRoleSubfolders() {
  const { data } = useLabels();

  return useMemo(() => {
    const byRole = new Map<string, Label[]>();
    for (const folder of data ?? []) {
      if (folder.role && folder.labels?.length) byRole.set(folder.role, folder.labels);
    }
    return byRole;
  }, [data]);
}

export function useThreadLabels(ids: string[]) {
  const { userLabels: labels = [] } = useLabels();

  const threadLabels = useMemo(() => {
    if (!labels) return [];
    return labels.filter((label) => (label.id ? ids.includes(label.id) : false));
  }, [labels, ids]);

  return { labels: threadLabels };
}
