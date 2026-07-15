import { LabelSidebarContextMenu } from '../context/label-sidebar-context';

import type { Label, Label as LabelType } from '@/types';
import { useSidebar } from '../context/sidebar-context';
import useSearchLabels from '@/hooks/use-labels-search';
import { Folder } from '../magicui/file-tree';
import { useNavigate } from 'react-router';
import { useStats } from '@/hooks/use-stats';

import { useCallback } from 'react';
import * as React from 'react';

/** Synthesized ancestors (Gmail 'a/b' with no 'a' label) exist at no provider — not navigable. */
const isPlaceholder = (id: string) => id.startsWith('virtual:') || id.startsWith('group-');

/** FolderRole -> the route the static nav already uses for it. */
const ROLE_ROUTE: Record<string, string> = {
  inbox: 'inbox',
  sent: 'sent',
  drafts: 'draft',
  spam: 'spam',
  trash: 'bin',
  archive: 'archive',
};

export const RecursiveFolder = ({
  label,
  activeAccount,
  count,
}: {
  label: Label & { originalLabel?: Label };
  activeAccount?: any;
  count?: number;
}) => {
  const { labels, setLabels } = useSearchLabels();
  const isActive = labels?.includes(label.id);
  const isFolderActive = isActive || window.location.pathname.includes(`/mail/label/${label.id}`);
  const navigate = useNavigate();
  const { setOpenMobile, isMobile } = useSidebar();
  const { data: stats } = useStats();

  const handleFilterByLabel = useCallback(
    (labelToFilter: LabelType) => {
      if (labels?.includes(labelToFilter.id)) {
        setLabels(labels.filter((l) => l !== labelToFilter.id));
      } else {
        setLabels([...(labels ?? []), labelToFilter.id]);
      }
    },
    [labels, setLabels],
  );

  const handleFolderClick = useCallback(
    (id: string) => {
      if (!activeAccount) return;
      if (isPlaceholder(id)) return;

      if (activeAccount.providerId === 'microsoft') {
        // A role folder has a canonical route already ('/mail/inbox'). Navigating to its raw id
        // would mirror the same provider folder under a second key, splitting its threads and
        // freshness across two scopes.
        navigate(`/mail/${ROLE_ROUTE[label.role ?? ''] ?? id}`);
      } else {
        handleFilterByLabel(label);
      }

      if (isMobile) {
        setOpenMobile(false);
      }
    },
    [navigate, handleFilterByLabel, activeAccount, label, isMobile, setOpenMobile],
  );

  const hasChildren = !!label.labels?.length;

  // label.unread is local-mode only; server mode has no per-label count on labels.list.
  const statCount =
    stats?.find((s) => s.label?.toLowerCase() === label.name.toLowerCase())?.count ?? 0;
  const unread = count ?? label.unread ?? statCount;

  return (
    <LabelSidebarContextMenu
      labelId={label.id}
      key={label.id}
      hide={activeAccount?.providerId === 'microsoft' || hasChildren || isPlaceholder(label.id)}
    >
      <Folder
        element={label.name}
        value={label.id}
        key={label.id}
        hasChildren={hasChildren}
        onFolderClick={handleFolderClick}
        isSelect={isFolderActive}
        count={unread}
        className="max-w-[192px]"
      >
        {label.labels?.map((childLabel) => (
          <RecursiveFolder key={childLabel.id} label={childLabel} activeAccount={activeAccount} />
        ))}
      </Folder>
    </LabelSidebarContextMenu>
  );
};
