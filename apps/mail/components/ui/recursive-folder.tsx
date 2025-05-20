import { useSearchValue } from '@/hooks/use-search-value';
import { useConnections } from '@/hooks/use-connections';
import type { Label as LabelType } from '@/types';
import { useSession } from '@/lib/auth-client';
import { Folder } from '../magicui/file-tree';
import { useNavigate } from 'react-router';
import { useCallback } from 'react';
import * as React from 'react';

export const RecursiveFolder = ({ label }: { label: any }) => {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useSearchValue();
  const { data: session } = useSession();
  const { data: connections } = useConnections();

  const handleFilterByLabel = (label: LabelType) => () => {
    const existingValue = searchValue.value;
    if (existingValue.includes(`label:${label.name}`)) {
      setSearchValue({
        value: existingValue.replace(`label:${label.name}`, ''),
        highlight: '',
        folder: '',
      });
      return;
    }
    const newValue = existingValue ? `${existingValue} label:${label.name}` : `label:${label.name}`;
    setSearchValue({
      value: newValue,
      highlight: '',
      folder: '',
    });
  };

  const activeAccount = React.useMemo(() => {
    if (!session?.activeConnection?.id || !connections?.connections) return null;
    return connections.connections.find(
      (connection) => connection.id === session.activeConnection?.id,
    );
  }, [session?.activeConnection?.id, connections?.connections]);

  const handleFolderClick = useCallback(
    (id: string) => {
      if (!activeAccount) return;
      console.log(label);
      if (activeAccount.providerId === 'microsoft') {
        navigate(`/mail/label/${id}`);
        console.log('microsoft');
      } else {
        handleFilterByLabel(label);
        console.log('not microsoft');
      }
    },
    [navigate, handleFilterByLabel],
  );

  const hasChildren = label.labels && label.labels.length > 0;

  return (
    <Folder
      element={label.name}
      value={label.id}
      key={label.id}
      hasChildren={hasChildren}
      onFolderClick={handleFolderClick}
    >
      {label.labels?.map((childLabel: any) => (
        <RecursiveFolder key={childLabel.id} label={childLabel} />
      ))}
    </Folder>
  );
};
