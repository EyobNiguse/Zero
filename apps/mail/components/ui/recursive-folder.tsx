import { useSearchValue } from '@/hooks/use-search-value';
import { useConnections } from '@/hooks/use-connections';
import type { Label as LabelType } from '@/types';
import { useSession } from '@/lib/auth-client';
import { useSidebar } from '../context/sidebar-context';
import { Folder } from '../magicui/file-tree';
import { useNavigate } from 'react-router';
import { useCallback } from 'react';
import * as React from 'react';

export const RecursiveFolder = ({ label }: { label: any }) => {
  const [searchValue, setSearchValue] = useSearchValue();
  const isActive = searchValue.value.includes(`label:${label.name}`);
  const isFolderActive = isActive || window.location.pathname.includes(`/mail/label/${label.id}`);
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { data: connections } = useConnections();
  const { setOpenMobile, isMobile } = useSidebar();

  const handleFilterByLabel = useCallback(
    (labelToFilter: LabelType) => {
      const existingValue = searchValue.value;
      if (existingValue.includes(`label:${labelToFilter.name}`)) {
        setSearchValue({
          value: existingValue.replace(`label:${labelToFilter.name}`, '').trim(),
          highlight: '',
          folder: '',
        });
        return;
      }
      const newValue = existingValue
        ? `${existingValue} label:${labelToFilter.name}`
        : `label:${labelToFilter.name}`;
      setSearchValue({
        value: newValue,
        highlight: '',
        folder: '',
      });
    },
    [searchValue, setSearchValue],
  );

  const activeAccount = React.useMemo(() => {
    if (!session?.activeConnection?.id || !connections?.connections) return null;
    return connections.connections.find(
      (connection) => connection.id === session.activeConnection?.id,
    );
  }, [session?.activeConnection?.id, connections?.connections]);

  const handleFolderClick = useCallback(
    (id: string) => {
      if (!activeAccount) return;

      // If it's a group folder, just expand/collapse without navigation
      if (id.startsWith('group-')) {
        return;
      }

      const labelToUse = label.originalLabel || label;

      // Handle navigation based on account type
      if (activeAccount.providerId === 'microsoft') {
        navigate(`/mail/label/${id}`);
      } else {
        handleFilterByLabel(labelToUse);
      }

      // Close the mobile sidebar when navigating to a folder
      if (isMobile) {
        setOpenMobile(false);
      }
    },
    [navigate, handleFilterByLabel, activeAccount, label, isMobile, setOpenMobile],
  );

  const hasChildren = label.labels && label.labels.length > 0;

  // Create a handler for folder expansion that doesn't close the sidebar
  const handleExpand = useCallback((id: string) => {
    // This function is intentionally empty because we don't want
    // to close the sidebar when expanding a folder
    // The actual expansion is handled by the Folder component internally
  }, []);

  return (
    <Folder
      element={label.name}
      value={label.id}
      key={label.id}
      hasChildren={hasChildren}
      onFolderClick={handleFolderClick}
      isSelect={isFolderActive}
    >
      {label.labels?.map((childLabel: any) => (
        <RecursiveFolder key={childLabel.id} label={childLabel} />
      ))}
    </Folder>
  );
};
