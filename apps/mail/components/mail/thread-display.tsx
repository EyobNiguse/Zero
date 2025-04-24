import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useParams } from 'next/navigation';
import Image from 'next/image';

import {
  ChevronLeft,
  ChevronRight,
  X,
  Reply,
  Archive,
  ThreeDots,
  Trash,
  Expand,
  ArchiveX,
  Forward,
  ReplyAll,
} from '../icons/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { moveThreadsTo, ThreadDestination } from '@/lib/thread-actions';
import { useMailNavigation } from '@/hooks/use-mail-navigation';
import { backgroundQueueAtom } from '@/store/backgroundQueue';
import { useThread, useThreads } from '@/hooks/use-threads';
import { markAsRead, markAsUnread } from '@/actions/mail';
import { MailDisplaySkeleton } from './mail-skeleton';
import { Button } from '@/components/ui/button';
import { modifyLabels } from '@/actions/mail';
import { useStats } from '@/hooks/use-stats';
import ThreadSubject from './thread-subject';
import ReplyCompose from './reply-composer';
import { Separator } from '../ui/separator';
import { useTranslations } from 'next-intl';
import { useMail } from '../mail/use-mail';
import { NotesPanel } from './note-panel';
import { cn, FOLDERS } from '@/lib/utils';
import MailDisplay from './mail-display';
import { ParsedMessage } from '@/types';
import { Inbox } from 'lucide-react';
import { useQueryState } from 'nuqs';
import { useAtom } from 'jotai';
import { toast } from 'sonner';

interface ThreadDisplayProps {
  threadParam?: any;
  onClose?: () => void;
  isMobile?: boolean;
  messages?: ParsedMessage[];
  id?: string;
}

export function ThreadDemo({ messages, isMobile }: ThreadDisplayProps) {
  const isFullscreen = false;
  const [mail, setMail] = useMail();

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
            <Icon ref={iconRef} className="dark:fill-iconDark fill-iconLight" />
            <span className="sr-only">{label}</span>
          </Button>
        </TooltipTrigger>
        {/* <TooltipContent>{label}</TooltipContent> */}
      </Tooltip>
    </TooltipProvider>
  );
}

export function ThreadDisplay({ isMobile, id }: ThreadDisplayProps) {
  const { data: emailData, isLoading, mutate: mutateThread } = useThread(id ?? null);
  const { mutate: mutateThreads } = useThreads();
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mail, setMail] = useMail();
  const t = useTranslations();
  const { mutate: mutateStats } = useStats();
  const { folder } = useParams<{ folder: string }>();
  const [threadId, setThreadId] = useQueryState('threadId');
  const [mode, setMode] = useQueryState('mode');
  const [, setBackgroundQueue] = useAtom(backgroundQueueAtom);
  const {
    data: { threads: items = [] },
  } = useThreads();

  const handleNavigateToThread = useCallback(
    (threadId: string) => {
      setThreadId(threadId);
      return false;
    },
    [setThreadId],
  );

  const handlePrevious = useCallback(() => {
    if (!id || !items.length) return;
    const currentIndex = items.findIndex((item) => item.id === id);
    if (currentIndex > 0) {
      const prevThread = items[currentIndex - 1];
      if (prevThread) {
        setThreadId(prevThread.id);
      }
    }
  }, [items, id, setThreadId]);

  const handleNext = useCallback(() => {
    if (!id || !items.length) return;
    const currentIndex = items.findIndex((item) => item.id === id);
    if (currentIndex < items.length - 1) {
      const nextThread = items[currentIndex + 1];
      if (nextThread) {
        setThreadId(nextThread.id);
      }
    }
  }, [items, id, setThreadId]);

  // Check if thread contains any images (excluding sender avatars)
  const hasImages = useMemo(() => {
    if (!emailData) return false;
    return emailData.messages.some((message) => {
      const hasAttachments = message.attachments?.some((attachment) =>
        attachment.mimeType?.startsWith('image/'),
      );
      const hasInlineImages =
        message.processedHtml?.includes('<img') &&
        !message.processedHtml.includes('data:image/svg+xml;base64'); // Exclude avatar SVGs
      return hasAttachments || hasInlineImages;
    });
  }, [emailData]);

  const hasMultipleParticipants =
    (emailData?.latest?.to?.length ?? 0) + (emailData?.latest?.cc?.length ?? 0) + 1 > 2;

  /**
   * Mark email as read if it's unread, if there are no unread emails, mark the current thread as read
   */
  useEffect(() => {
    if (!emailData || !id) return;
    const unreadEmails = emailData.messages.filter((e) => e.unread);
    console.log({
      totalReplies: emailData.totalReplies,
      unreadEmails: unreadEmails.length,
    });
    if (unreadEmails.length > 0) {
      const ids = [id, ...unreadEmails.map((e) => e.id)];
      markAsRead({ ids })
        .catch((error) => {
          console.error('Failed to mark email as read:', error);
          toast.error(t('common.mail.failedToMarkAsRead'));
        })
        .then(() => Promise.allSettled([mutateThread(), mutateStats()]));
    }
  }, [emailData, id]);

  const isInArchive = folder === FOLDERS.ARCHIVE;
  const isInSpam = folder === FOLDERS.SPAM;
  const isInBin = folder === FOLDERS.BIN;
  const handleClose = useCallback(() => {
    setThreadId(null);
    setMode(null);
  }, [setThreadId, setMode]);

  const moveThreadTo = useCallback(
    async (destination: ThreadDestination) => {
      if (!threadId) return;
      const promise = moveThreadsTo({
        threadIds: [threadId],
        currentFolder: folder,
        destination,
      });
      setBackgroundQueue({ type: 'add', threadId: `thread:${threadId}` });
      handleNext();
      toast.success(
        destination === 'inbox'
          ? t('common.actions.movedToInbox')
          : destination === 'spam'
            ? t('common.actions.movedToSpam')
            : destination === 'bin'
              ? t('common.actions.movedToBin')
              : t('common.actions.archived'),
      );
      toast.promise(promise, {
        error: t('common.actions.failedToMove'),
        finally: async () => {
          await Promise.all([mutateStats(), mutateThreads()]);
          setBackgroundQueue({ type: 'delete', threadId: `thread:${threadId}` });
        },
      });
    },
    [threadId, folder, mutateStats, mutateThreads, handleClose, t],
  );

  // const handleMarkAsUnread = useCallback(async () => {
  //   if (!emailData || !threadId) return;

  //   const promise = async () => {
  //     const result = await markAsUnread({ ids: [threadId] });
  //     if (!result.success) throw new Error('Failed to mark as unread');

  //     setMail((prev) => ({ ...prev, bulkSelected: [] }));
  //     await Promise.allSettled([mutateStats(), mutateThread()]);
  //     handleClose();
  //   };

  //   toast.promise(promise(), {
  //     loading: t('common.actions.markingAsUnread'),
  //     success: t('common.mail.markedAsUnread'),
  //     error: t('common.mail.failedToMarkAsUnread'),
  //   });
  // }, [emailData, threadId, t]);

  // const handleFavourites = async () => {
  //   if (!emailData || !threadId) return;
  //   const done = Promise.all([mutateThreads()]);
  //   if (emailData.latest?.tags?.includes('STARRED')) {
  //     toast.promise(
  //       modifyLabels({ threadId: [threadId], removeLabels: ['STARRED'] }).then(() => done),
  //       {
  //         success: t('common.actions.removedFromFavorites'),
  //         loading: t('common.actions.removingFromFavorites'),
  //         error: t('common.actions.failedToRemoveFromFavorites'),
  //       },
  //     );
  //   } else {
  //     toast.promise(
  //       modifyLabels({ threadId: [threadId], addLabels: ['STARRED'] }).then(() => done),
  //       {
  //         success: t('common.actions.addedToFavorites'),
  //         loading: t('common.actions.addingToFavorites'),
  //         error: t('common.actions.failedToAddToFavorites'),
  //       },
  //     );
  //   }
  // };

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [handleClose]);

  return (
    <div
      className={cn(
        'flex flex-col',
        isFullscreen ? 'h-screen' : isMobile ? 'h-full' : 'h-[calc(100vh-19px)]',
      )}
    >
      <div
        className={cn(
          'bg-panelLight dark:bg-panelDark relative flex flex-col overflow-hidden transition-all duration-300',
          isMobile ? 'h-full' : 'h-full',
          !isMobile && !isFullscreen && 'rounded-r-lg',
          isFullscreen ? 'fixed inset-0 z-50' : '',
        )}
      >
        <div></div>
        {!id ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center justify-center gap-2 text-center">
              <Image src="/empty-state.svg" alt="Empty Thread" width={200} height={200} />
              <div className="mt-5">
                <p className="text-lg">It's empty here</p>
                <p className="text-md text-white/50">Choose an email to view details</p>
              </div>
            </div>
          </div>
        ) : !emailData || isLoading ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ScrollArea className="h-full flex-1" type="auto">
              <div className="pb-4">
                <MailDisplaySkeleton isFullscreen={isFullscreen} />
              </div>
            </ScrollArea>
          </div>
        ) : (
          <>
            <div className="flex flex-shrink-0 items-center border-b border-[#E7E7E7] px-1 pb-1 md:px-3 md:pb-[11px] md:pt-[12px] dark:border-[#252525]">
              <div className="flex flex-1 items-center gap-2">
                <ThreadActionButton
                  icon={X}
                  label={t('common.actions.close')}
                  onClick={handleClose}
                />
                {/* <ThreadSubject subject={emailData.latest?.subject} /> */}
                <div className="bg-iconLight dark:bg-iconDark/20 relative h-3 w-0.5 rounded-full" />{' '}
                <div>
                  <ThreadActionButton
                    icon={ChevronLeft}
                    label="Previous email"
                    onClick={handlePrevious}
                  />
                  <ThreadActionButton icon={ChevronRight} label="Next email" onClick={handleNext} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          setMode('reply');
                        }}
                        className="inline-flex h-7 items-center justify-center gap-1 overflow-hidden rounded-md bg-white px-1.5 dark:bg-[#313131]"
                      >
                        <Reply className="fill-[#6D6D6D] dark:fill-[#9B9B9B]" />
                        <div className="hidden items-center justify-center gap-2.5 pl-0.5 pr-1 md:flex">
                          <div className="justify-start text-sm leading-none text-white">Reply</div>
                        </div>
                        <span className="sr-only md:hidden">Reply</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="md:hidden">
                      Reply
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          setMode('replyAll');
                        }}
                        className="inline-flex h-7 items-center justify-center gap-1 overflow-hidden rounded-md bg-white px-1.5 dark:bg-[#313131]"
                      >
                        <ReplyAll className="fill-[#6D6D6D] dark:fill-[#9B9B9B]" />
                        <div className="hidden items-center justify-center gap-2.5 pl-0.5 pr-1 md:flex">
                          <div className="justify-start text-sm leading-none text-white">
                            Reply All
                          </div>
                        </div>
                        <span className="sr-only md:hidden">Reply All</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="md:hidden">
                      Reply All
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          setMode('forward');
                        }}
                        className="inline-flex h-7 items-center justify-center gap-1 overflow-hidden rounded-md bg-white px-1.5 dark:bg-[#313131]"
                      >
                        <Forward className="fill-[#6D6D6D] dark:fill-[#9B9B9B]" />
                        <div className="hidden items-center justify-center gap-2.5 pl-0.5 pr-1 md:flex">
                          <div className="justify-start text-sm leading-none text-white">
                            Forward
                          </div>
                        </div>
                        <span className="sr-only md:hidden">Forward</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="md:hidden">
                      Forward
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <button
                  onClick={() => moveThreadTo('bin')}
                  className="inline-flex h-7 w-7 items-center justify-center gap-1 overflow-hidden rounded-md border border-[#FCCDD5] bg-[#FDE4E9] dark:border-[#6E2532] dark:bg-[#411D23]"
                >
                  <Trash className="fill-[#F43F5E]" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="inline-flex h-7 w-7 items-center justify-center gap-1 overflow-hidden rounded-md bg-white dark:bg-[#313131]">
                      <ThreeDots className="fill-iconLight dark:fill-iconDark" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white dark:bg-[#313131]">
                    {/* {threadId && (
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <StickyNote className="mr-2 h-4 w-4" />
                        <span>{t('common.notes.title')}</span>
                        <div className="absolute right-0 top-0" onClick={(e) => e.stopPropagation()}>
                          <NotesPanel threadId={threadId} />
                        </div>
                      </DropdownMenuItem>
                    )} */}
                    <DropdownMenuItem onClick={() => setIsFullscreen(!isFullscreen)}>
                      <Expand className="fill-iconLight dark:fill-iconDark mr-2" />
                      <span>
                        {isFullscreen
                          ? t('common.threadDisplay.exitFullscreen')
                          : t('common.threadDisplay.enterFullscreen')}
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Archive className="fill-iconLight dark:fill-iconDark" />
                      <span>{t('common.threadDisplay.archive')}</span>
                    </DropdownMenuItem>
                    {isInSpam || isInArchive || isInBin ? (
                      <DropdownMenuItem onClick={() => moveThreadTo('inbox')}>
                        <Inbox className="mr-2 h-4 w-4" />
                        <span>{t('common.mail.moveToInbox')}</span>
                      </DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem onClick={() => moveThreadTo('spam')}>
                          <ArchiveX className="fill-iconLight dark:fill-iconDark mr-2" />
                          <span>{t('common.threadDisplay.moveToSpam')}</span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <ScrollArea className="h-full flex-1" type="auto">
                <div className="pb-4">
                  {hasImages && !mail.showImages && (
                    <div className="bg-warning/10 border-warning/20 m-4 rounded-lg border p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-warning text-sm">{t('common.mail.imagesHidden')}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMail((prev) => ({ ...prev, showImages: true }))}
                        >
                          {t('common.mail.showImages')}
                        </Button>
                      </div>
                    </div>
                  )}
                  {(emailData.messages || []).map((message, index) => (
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
                        totalEmails={emailData?.totalReplies}
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className={cn('relative z-10 mt-3 px-2', isFullscreen ? 'mb-2' : '')}>
                <ReplyCompose />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
