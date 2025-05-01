import useBackgroundQueue from '@/hooks/ui/use-background-queue';
import { useMail } from '@/components/mail/use-mail';
import { useThreads } from '@/hooks/use-threads';
import { deleteThread } from '@/actions/mail';
import { useStats } from '@/hooks/use-stats';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

const useDelete = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [mail, setMail] = useMail();
  const { mutate: refetchThreads } = useThreads();
  const { mutate: refetchStats } = useStats();
  const t = useTranslations();
  const { addToQueue, deleteFromQueue } = useBackgroundQueue();

  return {
    mutate: (id: string, type: 'thread' | 'email' = 'thread') => {
      setIsLoading(true);
      addToQueue(id);
      return toast.promise(
        deleteThread({
          id,
        }),
        {
          loading: t('common.actions.deletingMail'),
          success: t('common.actions.deletedMail'),
          error: (error) => {
            console.error(`Error deleting ${type}:`, error);

            return t('common.actions.failedToDeleteMail');
          },
          finally: async () => {
            setMail({
              ...mail,
              bulkSelected: [],
            });
            deleteFromQueue(id);
            setIsLoading(false);
            await Promise.all([refetchThreads(), refetchStats()]);
          },
        },
      );
    },
    isLoading,
  };
};

export default useDelete;
