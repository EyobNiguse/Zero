import { moveThreadsTo, type MoveThreadOptions } from '@/lib/thread-actions';
import useBackgroundQueue from '@/hooks/ui/use-background-queue';
import { useMail } from '@/components/mail/use-mail';
import { useThreads } from '@/hooks/use-threads';
import { useStats } from '@/hooks/use-stats';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

const useMoveTo = () => {
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(false);
  const { mutate: refetchThreads } = useThreads();
  const { mutate: refetchStats } = useStats();
  const [mail, setMail] = useMail();
  const { addToQueue, deleteFromQueue } = useBackgroundQueue();

  const getCopyByDestination = (to?: MoveThreadOptions['destination']) => {
    switch (to) {
      case 'inbox':
        return {
          loading: t('common.actions.movingToInbox'),
          success: t('common.actions.movedToInbox'),
        };
      case 'spam':
        return {
          loading: t('common.actions.movingToSpam'),
          success: t('common.actions.movedToSpam'),
        };
      case 'bin':
        return {
          loading: t('common.actions.movingToBin'),
          success: t('common.actions.movedToBin'),
        };
      case 'archive':
        return {
          loading: t('common.actions.archiving'),
          success: t('common.actions.archived'),
        };
      default:
        return {
          loading: t('common.actions.moving'),
          success: t('common.actions.moved'),
        };
    }
  };

  const mutate = ({ threadIds, currentFolder, destination }: MoveThreadOptions) => {
    if (!threadIds.length) {
      return;
    }

    setIsLoading(true);
    const promise = moveThreadsTo({
      threadIds,
      currentFolder,
      destination,
    });
    for (const threadId of threadIds) {
      addToQueue(threadId);
    }
    return toast.promise(promise, {
      ...getCopyByDestination(destination),
      error: (error) => {
        console.error('Error moving thread(s):', error);

        return t('common.actions.failedToMove');
      },
      finally: async () => {
        setIsLoading(false);
        for (const threadId of threadIds) {
          deleteFromQueue(threadId);
        }
        await Promise.all([refetchThreads(), refetchStats()]);
        setMail({
          ...mail,
          bulkSelected: [],
        });
      },
    });
  };

  return {
    mutate,
    isLoading,
  };
};

export default useMoveTo;
