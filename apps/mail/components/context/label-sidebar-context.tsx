import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../ui/context-menu';
import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '../ui/button';
import { toast } from 'sonner';

interface LabelAction {
  id: string;
  label: string | ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
}

interface LabelSidebarContextMenuProps {
  children: ReactNode;
  labelId: string;
}

export function LabelSidebarContextMenu({ children, labelId }: LabelSidebarContextMenuProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const t = useTranslations();
  const trpc = useTRPC();
  const { mutateAsync: deleteLabel } = useMutation(trpc.labels.delete.mutationOptions());

  const handleDelete = () => {
    deleteLabel({ id: labelId });
    setDeleteDialogOpen(false);
    toast(t('common.labels.deleteLabelSuccess'));
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem
            onClick={() => setDeleteDialogOpen(true)}
            disabled={false}
            className="font-normal"
          >
            {t('common.labels.deleteLabel')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent showOverlay={true}>
          <DialogHeader>
            <DialogTitle>{t('common.labels.deleteLabelConfirm')}</DialogTitle>
            <DialogDescription>
              {t('common.labels.deleteLabelConfirmDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t('common.labels.deleteLabelConfirmCancel')}</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button onClick={handleDelete}>{t('common.labels.deleteLabelConfirmDelete')}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
