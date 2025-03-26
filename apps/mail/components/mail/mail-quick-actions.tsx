'use client';

import { Archive, Mail, Reply, Trash } from 'lucide-react';
import { useCallback, memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn, FOLDERS, LABELS } from '@/lib/utils';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useThreads } from '@/hooks/use-threads';
import { useStats } from '@/hooks/use-stats';
import { useTranslations } from 'next-intl';
import { markAsRead, markAsUnread } from '@/actions/mail';
import { moveThreadsTo, ThreadDestination } from '@/lib/thread-actions';
import { toast } from 'sonner';
import type { InitialThread } from '@/types';

interface MailQuickActionsProps {
  message: InitialThread;
  className?: string;
  isHovered?: boolean;
  isInQuickActionMode?: boolean;
  selectedQuickActionIndex?: number;
  resetNavigation?: () => void;
}

export const MailQuickActions = memo(({ 
  message, 
  className, 
  isHovered = false,
  isInQuickActionMode = false,
  selectedQuickActionIndex = 0,
  resetNavigation
}: MailQuickActionsProps) => {
  const { folder } = useParams<{ folder: string }>();
  const { mutate, isLoading } = useThreads();
  const { mutate: mutateStats } = useStats();
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(false);
  
  const currentFolder = folder ?? '';
  const isInbox = currentFolder === FOLDERS.INBOX;
  const isArchiveFolder = currentFolder === FOLDERS.ARCHIVE;

  const closeThreadIfOpen = useCallback(() => {
    const threadIdParam = searchParams.get('threadId');
    const messageId = message.threadId ?? message.id;
    
    if (threadIdParam === messageId) {
      const currentParams = new URLSearchParams(searchParams.toString());
      currentParams.delete('threadId');
      router.push(`/mail/${currentFolder}?${currentParams.toString()}`);
    }
    
    if (resetNavigation) {
      resetNavigation();
    }
  }, [searchParams, message, router, currentFolder, resetNavigation]);

  const handleArchive = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isProcessing || isLoading) return;
    
    setIsProcessing(true);
    try {
      const threadId = message.threadId ?? message.id;
      const destination = isArchiveFolder ? FOLDERS.INBOX : FOLDERS.ARCHIVE;

      await moveThreadsTo({
        threadIds: [`thread:${threadId}`],
        currentFolder: currentFolder,
        destination: destination as ThreadDestination
      }).then(async () => {
        await Promise.all([mutate(), mutateStats()]);
        
        const actionType = isArchiveFolder ? 'unarchive' : 'archive';
        toast.success(t(`common.mail.${actionType}`));
        
        closeThreadIfOpen();
      });
    } catch (error) {
      console.error('Error archiving thread', error);
      toast.error(t('common.mail.errorMoving'));
    } finally {
      setIsProcessing(false);
    }
  }, [message, currentFolder, isArchiveFolder, mutate, mutateStats, t, isProcessing, isLoading, closeThreadIfOpen]);

  const handleToggleRead = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isProcessing || isLoading) return;
    
    setIsProcessing(true);
    try {
      const threadId = message.threadId ?? message.id;
      
      if (message.unread) {
        await markAsRead({ ids: [threadId] }).then((response) => {
          if (response.success) {
            mutate();
            toast.success(t('common.mail.markedAsRead'));
          } else {
            toast.error(t('common.mail.failedToMarkAsRead'));
          }
          closeThreadIfOpen();
        });
      } else {
        await markAsUnread({ ids: [threadId] }).then((response) => {
          if (response.success) {
            mutate();
            toast.success(t('common.mail.markedAsUnread'));
          } else {
            toast.error(t('common.mail.failedToMarkAsUnread'));
          }
          closeThreadIfOpen();
        });
      }
    } catch (error) {
      console.error('Error toggling read status', error);
    } finally {
      setIsProcessing(false);
    }
  }, [message, mutate, t, isProcessing, isLoading, closeThreadIfOpen]);

  const handleDelete = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isProcessing || isLoading) return;
    
    setIsProcessing(true);
    try {
      const threadId = message.threadId ?? message.id;
      
      await moveThreadsTo({
        threadIds: [`thread:${threadId}`],
        currentFolder: currentFolder,
        destination: FOLDERS.TRASH as ThreadDestination
      }).then(async () => {
        await Promise.all([mutate(), mutateStats()]);
        toast.success(t('common.mail.moveToTrash'));
        closeThreadIfOpen();
      });
    } catch (error) {
      console.error('Error moving to trash', error);
      toast.error(t('common.mail.errorMoving'));
    } finally {
      setIsProcessing(false);
    }
  }, [message, currentFolder, mutate, mutateStats, t, isProcessing, isLoading, closeThreadIfOpen]);

  const handleQuickReply = useCallback(async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isProcessing) return;
    
    setIsProcessing(true);
    try {
      // TODO: Implement quick reply
      toast.info(t('common.mail.reply'));
    } finally {
      setIsProcessing(false);
    }
  }, [t, isProcessing]);

  const quickActions = [
    { action: handleArchive, icon: Archive, label: isArchiveFolder || !isInbox ? t('common.mail.unarchive') : t('common.mail.archive') },
    { action: handleToggleRead, icon: Mail, label: message.unread ? t('common.mail.markAsRead') : t('common.mail.markAsUnread') },
    { action: handleDelete, icon: Trash, label: t('common.mail.moveToTrash') },
    { action: handleQuickReply, icon: Reply, label: t('common.mail.reply') }
  ];

  if (!isHovered && !isInQuickActionMode) {
    return null;
  }

  return (
    <div 
      className={cn(
        'absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-md p-1 z-10 overflow-visible',
        className,
        isInQuickActionMode && 'bg-background/95 ring-2 ring-primary/20'
      )}
    >
      {quickActions.map((quickAction, index) => (
        <Button 
          key={index}
          variant={isInQuickActionMode && selectedQuickActionIndex === index ? "secondary" : "ghost"}
          size="icon" 
          className={cn(
            "h-7 w-7 mail-quick-action-button", 
            isInQuickActionMode && selectedQuickActionIndex === index && 
            "border border-primary/60 shadow-sm"
          )}
          onClick={(e) => quickAction.action(e)}
          disabled={isLoading || isProcessing}
          aria-label={quickAction.label}
        >
          <quickAction.icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
});

MailQuickActions.displayName = 'MailQuickActions'; 