import { useActiveConnection } from '@/hooks/use-connections';
import { RecursiveFolder } from './recursive-folder';
import type { Label as LabelType } from '@/types';
import { Tree } from '../magicui/file-tree';

type Props = {
  data: LabelType[];
};

const SidebarLabels = ({ data }: Props) => {
  const { data: activeAccount } = useActiveConnection();

  return (
    <div className="mr-0 flex-1 pr-0">
      <div className="no-scrollbar relative -m-2 flex-1 overflow-auto bg-transparent">
        <Tree className="rounded-md bg-transparent">
          {data?.map((label) => (
            <RecursiveFolder key={label.id} label={label} activeAccount={activeAccount} />
          ))}
        </Tree>
      </div>
    </div>
  );
};

export default SidebarLabels;
