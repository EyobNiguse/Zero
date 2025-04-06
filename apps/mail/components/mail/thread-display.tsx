import {
  Archive,
  ArchiveX,
  Expand,
  Forward,
  ForwardIcon,
  Mail,
  MoreVertical,
  Reply,
  ReplyAll,
  Star,
  StarOff,
  X,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useSearchParams, useParams } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';

import { moveThreadsTo, ThreadDestination } from '@/lib/thread-actions';
import { MoreVerticalIcon } from '../icons/animated/more-vertical';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useThread, useThreads } from '@/hooks/use-threads';
import { ArchiveIcon } from '../icons/animated/archive';
import { ExpandIcon } from '../icons/animated/expand';
import { MailDisplaySkeleton } from './mail-skeleton';
import { ReplyIcon } from '../icons/animated/reply';
import { Button } from '@/components/ui/button';
import { markAsUnread } from '@/actions/mail';
import { modifyLabels } from '@/actions/mail';
import { useStats } from '@/hooks/use-stats';
import ThreadSubject from './thread-subject';
import { XIcon } from '../icons/animated/x';
import ReplyCompose from './reply-composer';
import { useTranslations } from 'next-intl';
import { useMail } from '../mail/use-mail';
import { NotesPanel } from './note-panel';
import { cn, FOLDERS } from '@/lib/utils';
import MailDisplay from './mail-display';
import { ParsedMessage } from '@/types';
import { Inbox } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

interface ThreadDisplayProps {
  threadParam?: any;
  onClose?: () => void;
  isMobile?: boolean;
  messages?: ParsedMessage[];
  id?: string;
}

export function ThreadDemo({ messages, isMobile }: ThreadDisplayProps) {
  const isFullscreen = false;

  return (
    <div
      className={cn(
        'flex flex-col',
        isFullscreen ? 'h-screen' : isMobile ? 'h-full' : 'h-[calc(100vh-2rem)]',
      )}
    >
      <div
        className={cn(
          'bg-offsetLight dark:bg-offsetDark relative flex flex-col overflow-hidden transition-all duration-300',
          isMobile ? 'h-full' : 'h-full',
          !isMobile && !isFullscreen && 'rounded-r-lg',
          isFullscreen ? 'fixed inset-0 z-50' : '',
        )}
      >
        <div className="flex flex-shrink-0 items-center border-b p-2">
          <div className="flex flex-1 items-center gap-2">
            <Button variant="ghost" className="md:h-fit md:px-2" disabled={!messages}>
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>

            <ThreadSubject subject={'Join the Email Revolution with Zero!'} />
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" className="md:h-fit md:px-2" disabled={!messages}>
                  {isFullscreen ? (
                    <ExpandIcon className="h-4 w-4" />
                  ) : (
                    <ExpandIcon className="h-4 w-4" />
                  )}
                  <span className="sr-only">
                    {isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" className="md:h-fit md:px-2" disabled={!messages}>
                  <ArchiveIcon className="relative top-0.5 h-4 w-4" />
                  <span className="sr-only">Archive</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Archive</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" className="md:h-fit md:px-2" disabled={!messages}>
                  <ReplyIcon className="h-4 w-4" />
                  <span className="sr-only">Reply</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reply</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="md:h-fit md:px-2" disabled={!messages}>
                  <MoreVerticalIcon className="h-4 w-4" />
                  <span className="sr-only">More</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <ArchiveX className="mr-2 h-4 w-4" /> Move to spam
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Forward className="mr-2 h-4 w-4" /> Forward
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ScrollArea className="flex-1" type="scroll">
            <div className="pb-4">
              {[...(messages || [])].reverse().map((message, index) => (
                <div
                  key={message.id}
                  className={cn(
                    'transition-all duration-200',
                    index > 0 && 'border-border border-t',
                  )}
                >
                  <MailDisplay
                    demo
                    emailData={message}
                    isFullscreen={isFullscreen}
                    isMuted={false}
                    isLoading={false}
                    index={index}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="relative flex-shrink-0 md:top-1">
            {messages ? (
              <ReplyCompose emailData={messages} isOpen={false} setIsOpen={() => {}} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  className,
}: {
  icon: React.ComponentType<React.ComponentPropsWithRef<any>> & {
    startAnimation?: () => void;
    stopAnimation?: () => void;
  };
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const iconRef = useRef<any>(null);

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={disabled}
            onClick={onClick}
            variant="ghost"
            className={cn('md:h-fit md:px-2', className)}
            onMouseEnter={() => iconRef.current?.startAnimation?.()}
            onMouseLeave={() => iconRef.current?.stopAnimation?.()}
          >
            <Icon ref={iconRef} className="h-4 w-4" />
            <span className="sr-only">{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ThreadDisplay({ threadParam, onClose, isMobile, id }: ThreadDisplayProps) {
  const { data: emailData, isLoading } = useThread(id ?? null);
  const { mutate: mutateThreads } = useThreads();
  const searchParams = useSearchParams();
  const [isMuted, setIsMuted] = useState(false);
  const [isReplyOpen, setIsReplyOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  const t = useTranslations();
  const { mutate: mutateStats } = useStats();
  const { folder } = useParams<{ folder: string }>();
  const threadIdParam = searchParams.get('threadId');
  const threadId = threadParam ?? threadIdParam ?? '';
  const [, setMailState] = useMail();

  const moreVerticalIconRef = useRef<any>(null);

  const isInInbox = folder === FOLDERS.INBOX || !folder;
  const isInArchive = folder === FOLDERS.ARCHIVE;
  const isInSpam = folder === FOLDERS.SPAM;

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const moveThreadTo = useCallback(
    async (destination: ThreadDestination) => {
      const promise = async () => {
        await moveThreadsTo({
          threadIds: [threadId],
          currentFolder: folder,
          destination,
        });
        await Promise.all([mutateStats(), mutateThreads()]);
        handleClose();
      };

      toast.promise(promise(), {
        loading: t('common.actions.moving'),
        success:
          destination === 'inbox'
            ? t('common.actions.movedToInbox')
            : destination === 'spam'
              ? t('common.actions.movedToSpam')
              : t('common.actions.archived'),
        error: t('common.actions.failedToMove'),
      });
    },
    [threadId, folder, mutateStats, mutateThreads, handleClose, t],
  );

  const handleMarkAsUnread = useCallback(async () => {
    if (!emailData || !threadId) return;

    const promise = async () => {
      const result = await markAsUnread({ ids: [threadId] });
      if (!result.success) throw new Error('Failed to mark as unread');

      setMailState((prev) => ({ ...prev, bulkSelected: [] }));
      await Promise.all([mutateStats(), mutateThreads()]);
      handleClose();
    };

    toast.promise(promise(), {
      loading: t('common.actions.markingAsUnread'),
      success: t('common.mail.markedAsUnread'),
      error: t('common.mail.failedToMarkAsUnread'),
    });
  }, [emailData, threadId, mutateStats, mutateThreads, t, handleClose, setMailState]);

  const handleFavourites = async () => {
    if (!emailData || !threadId) return;
    const done = Promise.all([mutateThreads()]);
    if (emailData[0]?.tags?.includes('STARRED')) {
      toast.promise(
        modifyLabels({ threadId: [threadId], removeLabels: ['STARRED'] }).then(() => done),
        {
          success: 'Removed from favourites.',
          loading: 'Removing from favourites',
          error: 'Failed to remove from favourites.',
        },
      );
    } else {
      toast.promise(
        modifyLabels({ threadId: [threadId], addLabels: ['STARRED'] }).then(() => done),
        {
          success: 'Added to favourites.',
          loading: 'Adding to favourites.',
          error: 'Failed to add to favourites.',
        },
      );
    }
  };

  const handleForward = () => {
    setIsForwardOpen(true);
  };

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [handleClose]);

  if (!emailData || isLoading)
    return (
      <div
        className={cn(
          'flex flex-col',
          isFullscreen ? 'h-screen' : isMobile ? 'h-full' : 'h-[calc(100vh-2rem)]',
        )}
      >
        <div
          className={cn(
            'bg-offsetLight dark:bg-offsetDark relative flex flex-col overflow-hidden transition-all duration-300',
            isMobile ? 'h-full' : 'h-full',
            !isMobile && !isFullscreen && 'rounded-r-lg',
            isFullscreen ? 'fixed inset-0 z-50' : '',
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ScrollArea className="h-full flex-1" type="auto">
              <div className="pb-4">
                <MailDisplaySkeleton isFullscreen={isFullscreen} />
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    );

  return (
    <div
      className={cn(
        'flex flex-col',
        isFullscreen ? 'h-screen' : isMobile ? 'h-full' : 'h-[calc(100vh-2rem)]',
      )}
    >
      <div
        className={cn(
          'bg-offsetLight dark:bg-offsetDark relative flex flex-col transition-all duration-300',
          isMobile ? 'h-full' : 'h-full',
          !isMobile && !isFullscreen && 'rounded-r-lg',
          isFullscreen ? 'fixed inset-0 z-50' : '',
        )}
      >
        <div className="flex flex-shrink-0 items-center border-b px-1 pb-1 md:px-3 md:pb-2 md:pt-[10px]">
          <div className="flex flex-1 items-center gap-2">
            <ThreadActionButton
              icon={XIcon}
              label={t('common.actions.close')}
              onClick={handleClose}
            />
            <ThreadSubject subject={emailData[0]?.subject} />
          </div>
          <div className="flex items-center md:gap-2">
            {/* disable notes for now, it's still a bit buggy and not ready for prod. */}
            {/* <NotesPanel threadId={threadId} /> */}
            <ThreadActionButton
              icon={Expand}
              label={
                isFullscreen
                  ? t('common.threadDisplay.exitFullscreen')
                  : t('common.threadDisplay.enterFullscreen')
              }
              disabled={!emailData}
              onClick={() => setIsFullscreen(!isFullscreen)}
            />
            {isInSpam || isInArchive ? (
              <ThreadActionButton
                icon={Inbox}
                label={t('common.mail.moveToInbox')}
                disabled={!emailData}
                onClick={() => moveThreadTo('inbox')}
              />
            ) : (
              <>
                <ThreadActionButton
                  icon={Archive}
                  label={t('common.threadDisplay.archive')}
                  disabled={!emailData}
                  onClick={() => moveThreadTo('archive')}
                />
                <ThreadActionButton
                  icon={ArchiveX}
                  label={t('common.threadDisplay.moveToSpam')}
                  disabled={!emailData}
                  onClick={() => moveThreadTo('spam')}
                />
              </>
            )}
            <ThreadActionButton
              icon={Mail}
              label={t('common.mail.markAsUnread')}
              disabled={!emailData}
              onClick={handleMarkAsUnread}
            />
            <ThreadActionButton
              icon={Reply}
              label={t('common.threadDisplay.reply')}
              disabled={!emailData}
              onClick={() => {
                if (isForwardOpen) {
                  setIsForwardOpen(false);
                  setIsReplyOpen(true);
                } else {
                  setIsReplyOpen(!isReplyOpen);
                }
              }}
            />
            <ThreadActionButton
              icon={Forward}
              label={t('common.threadDisplay.forward')}
              disabled={!emailData}
              onClick={() => {
                if (isReplyOpen) {
                  setIsReplyOpen(false);
                  setIsForwardOpen(true);
                } else {
                  setIsForwardOpen(!isForwardOpen);
                }
              }}
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="h-full flex-1" type="auto">
            <div className="pb-4">
              {(emailData || []).map((message, index) => (
                <div
                  key={message.id}
                  className={cn(
                    'transition-all duration-200',
                    index > 0 && 'border-border border-t',
                  )}
                >
                  <MailDisplay
                    emailData={message}
                    isFullscreen={isFullscreen}
                    isMuted={isMuted}
                    isLoading={false}
                    index={index}
                    totalEmails={emailData.length}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className={isFullscreen ? 'mb-2' : ''}>
            <ReplyCompose
              emailData={emailData}
              isOpen={isReplyOpen || isForwardOpen}
              setIsOpen={(open) => {
                if (isForwardOpen) {
                  setIsForwardOpen(open);
                } else {
                  setIsReplyOpen(open);
                }
              }}
              mode={isForwardOpen ? 'forward' : 'reply'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
