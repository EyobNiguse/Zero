import {
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogClose,
} from '../ui/dialog';
import {
  Bell,
  Calendar,
  Docx,
  Figma,
  Forward,
  ImageFile,
  Lightning,
  PDF,
  Reply,
  ReplyAll,
  Tag,
  User,
} from '../icons/icons';
import {
  BellOff,
  Check,
  ChevronDown,
  LoaderCircleIcon,
  Lock,
  FileText,
  ImageIcon,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { memo, useEffect, useMemo, useState, useRef } from 'react';
import { Briefcase, Star, StickyNote, Users } from 'lucide-react';
import { handleUnsubscribe } from '@/lib/email-utils.client';
import { getListUnsubscribeAction } from '@/lib/email-utils';
import AttachmentsAccordion from './attachments-accordion';
import { cn, getEmailLogo, formatDate } from '@/lib/utils';
import AttachmentDialog from './attachment-dialog';
import { useSummary } from '@/hooks/use-summary';
import { TextShimmer } from '../ui/text-shimmer';
import { type ParsedMessage } from '@/types';
import { Separator } from '../ui/separator';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MailIframe } from './mail-iframe';
import { MailLabels } from './mail-list';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { format } from 'date-fns';
import Image from 'next/image';
import { useQueryState } from 'nuqs';
import ReplyCompose from './reply-composer';

// Add formatFileSize utility function
const formatFileSize = (size: number) => {
  const sizeInMB = (size / (1024 * 1024)).toFixed(2);
  return sizeInMB === '0.00' ? '' : `${sizeInMB} MB`;
};

// Add getFileIcon utility function
const getFileIcon = (filename: string) => {
  const extension = filename.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'pdf':
      return <PDF className="fill-[#F43F5E]" />;
    case 'jpg':
      return <ImageFile />;
    case 'jpeg':
      return <ImageFile />;
    case 'png':
      return <ImageFile />;
    case 'gif':
      return <ImageFile />;
    case 'docx':
      return <Docx />;
    case 'fig':
      return <Figma />;
    case 'webp':
      return <ImageFile />;
    default:
      return <FileText className="h-4 w-4 text-[#8B5CF6]" />;
  }
};

const StreamingText = ({ text }: { text: string }) => {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    let currentIndex = 0;
    setIsComplete(false);
    setIsThinking(true);

    const thinkingTimeout = setTimeout(() => {
      setIsThinking(false);
      setDisplayText('');

      const interval = setInterval(() => {
        if (currentIndex < text.length) {
          const nextChar = text[currentIndex];
          setDisplayText((prev) => prev + nextChar);
          currentIndex++;
        } else {
          setIsComplete(true);
          clearInterval(interval);
        }
      }, 20);

      return () => clearInterval(interval);
    }, 1000);

    return () => {
      clearTimeout(thinkingTimeout);
    };
  }, [text]);

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'bg-gradient-to-r from-neutral-500 via-neutral-300 to-neutral-500 bg-[length:200%_100%] bg-clip-text text-sm leading-relaxed text-transparent',
          isComplete ? 'animate-shine-slow' : '',
        )}
      >
        {isThinking ? (
          <TextShimmer duration={1}>Thinking...</TextShimmer>
        ) : (
          <span>{displayText}</span>
        )}
        {!isComplete && !isThinking && (
          <span className="animate-blink bg-primary ml-0.5 inline-block h-4 w-0.5"></span>
        )}
      </div>
    </div>
  );
};

type Props = {
  emailData: ParsedMessage;
  isFullscreen: boolean;
  isMuted: boolean;
  isLoading: boolean;
  index: number;
  totalEmails?: number;
  demo?: boolean;
  subject?: string;
};

const MailDisplayLabels = ({ labels }: { labels: string[] }) => {
  const visibleLabels = labels.filter(
    (label) => !['unread', 'inbox'].includes(label.toLowerCase()),
  );

  if (!visibleLabels.length) return null;

  return (
    <div className="flex">
      {visibleLabels.map((label, index) => {
        const normalizedLabel = label.toLowerCase().replace(/^category_/i, '');

        let icon = null;
        let bgColor = '';

        switch (normalizedLabel) {
          case 'important':
            icon = <Lightning className="h-3.5 w-3.5 fill-white" />;
            bgColor = 'bg-[#F59E0D]';
            break;
          case 'promotions':
            icon = <Tag className="h-3.5 w-3.5 fill-white" />;
            bgColor = 'bg-[#F43F5E]';
            break;
          case 'personal':
            icon = <User className="h-3.5 w-3.5 fill-white" />;
            bgColor = 'bg-[#39AE4A]';
            break;
          case 'updates':
            icon = <Bell className="h-3.5 w-3.5 fill-white" />;
            bgColor = 'bg-[#8B5CF6]';
            break;
          case 'work':
            icon = <Briefcase className="h-3.5 w-3.5 text-white" />;
            bgColor = 'bg-neutral-600';
            break;
          case 'forums':
            icon = <Users className="h-3.5 w-3.5 text-white" />;
            bgColor = 'bg-blue-600';
            break;
          case 'notes':
            icon = <StickyNote className="h-3.5 w-3.5 text-white" />;
            bgColor = 'bg-amber-500';
            break;
          case 'starred':
            icon = <Star className="h-3.5 w-3.5 text-white" />;
            bgColor = 'bg-yellow-500';
            break;
          default:
            return null;
        }

        return (
          <Badge
            key={`${label}-${index}`}
            className={`rounded-md p-1 ${bgColor} -ml-1.5 border-2 border-white transition-transform first:ml-0 dark:border-[#1A1A1A]`}
          >
            {icon}
          </Badge>
        );
      })}
    </div>
  );
};

// Helper function to get first letter character
const getFirstLetterCharacter = (name?: string) => {
  if (!name) return '';
  const match = name.match(/[a-zA-Z]/);
  return match ? match[0].toUpperCase() : '';
};

// Helper function to clean email display
const cleanEmailDisplay = (email?: string) => {
  if (!email) return '';
  const match = email.match(/^[^a-zA-Z]*(.*?)[^a-zA-Z]*$/);
  return match ? match[1] : email;
};

// Helper function to clean name display
const cleanNameDisplay = (name?: string) => {
  if (!name) return '';
  const match = name.match(/^[^a-zA-Z]*(.*?)[^a-zA-Z]*$/);
  return match ? match[1] : name;
};

const MailDisplay = ({ emailData, isMuted, index, totalEmails, demo }: Props) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [isUnsubscribing, setIsUnsubscribing] = useState(false);
  const { folder } = useParams<{ folder: string }>();
  const [selectedAttachment, setSelectedAttachment] = useState<null | {
    id: string;
    name: string;
    type: string;
    url: string;
  }>(null);
  const [openDetailsPopover, setOpenDetailsPopover] = useState<boolean>(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const t = useTranslations();

  const { data } = demo
    ? {
        data: {
          content:
            'This email talks about how Zero Email is the future of email. It is a new way to send and receive emails that is more secure and private.',
        },
      }
    : useSummary(emailData.id);

  useEffect(() => {
    if (!demo) {
      setIsCollapsed(false);
      if (totalEmails && index === totalEmails - 1) {
        if (totalEmails > 5) {
          setTimeout(() => {
            const element = document.getElementById(`mail-${emailData.id}`);
            element?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      }
    }
  }, [index, emailData.id, totalEmails, demo]);

  const listUnsubscribeAction = useMemo(
    () =>
      emailData.listUnsubscribe
        ? getListUnsubscribeAction({
            listUnsubscribe: emailData.listUnsubscribe,
            listUnsubscribePost: emailData.listUnsubscribePost,
          })
        : undefined,
    [emailData.listUnsubscribe, emailData.listUnsubscribePost],
  );

  const _handleUnsubscribe = async () => {
    setIsUnsubscribing(true);
    try {
      await handleUnsubscribe({
        emailData,
      });
      setIsUnsubscribing(false);
      setUnsubscribed(true);
    } catch (e) {
      setIsUnsubscribing(false);
      setUnsubscribed(false);
    }
  };

const [mode, setMode] = useQueryState('mode');


  return (
    <div className={cn('relative flex-1 overflow-hidden')} id={`mail-${emailData.id}`}>
      <div className="relative h-full overflow-y-auto">
        <div
          className="flex flex-col py-4 pb-2 transition-all duration-200 "
          // onClick={() => setIsCollapsed(!isCollapsed)}
        >
          
          {index === 0 && (
            <div className="mb-2 border-b px-4 pb-4">
              <p className="font-medium text-black dark:text-white">
                {emailData.subject}{' '}
                <span className="text-[#6D6D6D] dark:text-[#8C8C8C]">
                  {totalEmails && `[${totalEmails}]`}
                </span>
              </p>
              <div className="mb-4 mt-1 flex items-center gap-1">
                <Calendar className="size-3.5 fill-[#6D6D6D] dark:fill-[#8C8C8C]" />
                <span className="text-sm font-medium text-[#6D6D6D] dark:text-[#8C8C8C]">
                  {formatDate(emailData?.receivedOn)}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <MailDisplayLabels labels={emailData?.tags || []} />
                <div className="bg-iconLight dark:bg-iconDark/20 relative h-3 w-0.5 rounded-full" />
                <div className="flex items-center gap-2 text-sm text-[#6D6D6D] dark:text-[#8C8C8C]">
                  {(() => {
                    interface Person {
                      name: string;
                      email: string;
                    }

                    const allPeople = [
                      ...(folder === 'sent' ? [] : [emailData.sender]),
                      ...(emailData.to || []),
                      ...(emailData.cc || []),
                      ...(emailData.bcc || []),
                    ];

                    const people = allPeople.filter(
                      (p): p is Person =>
                        Boolean(p?.email) &&
                        p.name !== 'No Sender Name' &&
                        p === allPeople.find((other) => other?.email === p?.email),
                    );

                    const renderPerson = (person: Person) => (
                      <div
                        key={person.email}
                        className="inline-flex items-center justify-start gap-1.5 overflow-hidden rounded-full border  bg-[#F5F5F5] py-1 pl-1 pr-2.5 dark:border-[#2B2B2B] border-[#DBDBDB] dark:bg-[#1A1A1A]"
                      >
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={getEmailLogo(person.email)} className="rounded-full" />
                          <AvatarFallback className="rounded-full bg-[#FFFFFF] text-xs font-bold dark:bg-[#373737]">
                            {getFirstLetterCharacter(person.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="justify-start text-sm font-medium leading-none text-[#1A1A1A] dark:text-white">
                          {person.name || person.email}
                        </div>
                      </div>
                    );

                    if (people.length <= 2) {
                      return people.map(renderPerson);
                    }

                    // Only show first two people plus count if we have at least two people
                    const firstPerson = people[0];
                    const secondPerson = people[1];

                    if (firstPerson && secondPerson) {
                      return (
                        <>
                          {renderPerson(firstPerson)}
                          {renderPerson(secondPerson)}
                          <span className="text-sm">+{people.length - 2} others</span>
                        </>
                      );
                    }

                    return null;
                  })()}
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 flex w-full items-start justify-between gap-4 px-4">
            <div className="flex w-full justify-center gap-4">
              <Avatar className="h-8 w-8 rounded-full mt-1.5">
                <AvatarImage
                  className="bg-muted-foreground/50 dark:bg-muted/50 rounded-full p-2"
                  src={getEmailLogo(emailData?.sender?.email)}
                />
                <AvatarFallback className="rounded-full bg-[#FFFFFF] font-bold dark:bg-[#373737] text-[#9F9F9F]">
                  {getFirstLetterCharacter(emailData?.sender?.name)}
                </AvatarFallback>
              </Avatar>

              <div className="flex w-full items-center justify-between">
                <div className="flex w-full items-center justify-start gap-2">
                  <div className="flex w-full flex-col">
                    <div className="flex w-full items-center justify-between">
                      <span className="font-semibold">
                        {cleanNameDisplay(emailData?.sender?.name)}
                      </span>
                      <time className="text-sm font-medium text-[#6D6D6D] dark:text-[#8C8C8C]">
                        {formatDate(emailData?.receivedOn)}
                      </time>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium text-[#6D6D6D] dark:text-[#8C8C8C]">
                        To:{' '}
                        {(() => {
                          // Combine to and cc recipients
                          const allRecipients = [
                            ...(emailData?.to || []),
                            ...(emailData?.cc || []),
                          ];

                          // If you're the only recipient
                          if (allRecipients.length === 1 && folder !== 'sent') {
                            return <span key="you">You</span>;
                          }

                          // Show first 3 recipients + count of others
                          const visibleRecipients = allRecipients.slice(0, 3);
                          const remainingCount = allRecipients.length - 3;

                          return (
                            <>
                              {visibleRecipients.map((recipient, index) => (
                                <span key={recipient.email}>
                                  {cleanNameDisplay(recipient.name) ||
                                    cleanEmailDisplay(recipient.email)}
                                  {index < visibleRecipients.length - 1 ? ', ' : ''}
                                </span>
                              ))}
                              {remainingCount > 0 && (
                                <span key="others">{`, +${remainingCount} others`}</span>
                              )}
                            </>
                          );
                        })()}
                      </p>
                      {emailData?.bcc?.length > 0 && (
                        <p className="text-sm font-medium text-[#6D6D6D] dark:text-[#8C8C8C]">
                          Bcc:{' '}
                          {emailData?.bcc?.map((recipient, index) => (
                            <span key={recipient.email}>
                              {cleanNameDisplay(recipient.name) ||
                                cleanEmailDisplay(recipient.email)}
                              {index < (emailData?.bcc?.length || 0) - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-muted-foreground flex grow-0 items-center gap-2 text-sm">
                    {/* <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                      {emailData?.sender?.email}
                    </span> */}

                    {/* {listUnsubscribeAction && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            size="xs"
                            variant="secondary"
                            disabled={unsubscribed || isUnsubscribing}
                          >
                            {unsubscribed && <Check className="h-4 w-4" />}
                            {isUnsubscribing && (
                              <LoaderCircleIcon className="h-4 w-4 animate-spin" />
                            )}
                            {unsubscribed
                              ? t('common.mailDisplay.unsubscribed')
                              : t('common.mailDisplay.unsubscribe')}
                          </Button>
                        </DialogTrigger>

                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{t('common.mailDisplay.unsubscribe')}</DialogTitle>
                            <DialogDescription className="break-words">
                              {t('common.mailDisplay.unsubscribeDescription')}
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter className="gap-2">
                            <DialogClose asChild>
                              <Button disabled={isUnsubscribing} variant="outline">
                                {t('common.mailDisplay.cancel')}
                              </Button>
                            </DialogClose>
                            <DialogClose asChild>
                              <Button disabled={isUnsubscribing} onClick={_handleUnsubscribe}>
                                {t('common.mailDisplay.unsubscribe')}
                              </Button>
                            </DialogClose>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                    {isMuted && <BellOff className="h-4 w-4" />} */}
                  </span>
                </div>
                {/* <div className="flex items-center gap-2">
                  <time className="text-muted-foreground text-xs">
                    {formatDate(emailData?.receivedOn)}
                  </time>
                  <Popover open={openDetailsPopover} onOpenChange={setOpenDetailsPopover}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 text-xs underline hover:bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDetailsPopover(!openDetailsPopover);
                        }}
                        ref={triggerRef}
                      >
                        {t('common.mailDisplay.details')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[420px] rounded-lg border p-3 shadow-lg"
                      onBlur={(e) => {
                        if (!triggerRef.current?.contains(e.relatedTarget)) {
                          setOpenDetailsPopover(false);
                        }
                      }}
                    >
                      <div className="space-y-1 text-sm">
                        <div className="flex">
                          <span className="w-24 text-end text-gray-500">
                            {t('common.mailDisplay.from')}:
                          </span>
                          <div className="ml-3">
                            <span className="text-muted-foreground pr-1 font-bold">
                              {cleanNameDisplay(emailData?.sender?.name)}
                            </span>
                            {emailData?.sender?.name !== emailData?.sender?.email && (
                              <span className="text-muted-foreground">
                                {cleanEmailDisplay(emailData?.sender?.email)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex">
                          <span className="w-24 text-end text-gray-500">
                            {t('common.mailDisplay.to')}:
                          </span>
                          <span className="text-muted-foreground ml-3">
                            {emailData?.to?.map((t) => cleanEmailDisplay(t.email)).join(', ')}
                          </span>
                        </div>
                        {emailData?.cc && emailData.cc.length > 0 && (
                          <div className="flex">
                            <span className="w-24 text-end text-gray-500">
                              {t('common.mailDisplay.cc')}:
                            </span>
                            <span className="text-muted-foreground ml-3">
                              {emailData?.cc?.map((t) => cleanEmailDisplay(t.email)).join(', ')}
                            </span>
                          </div>
                        )}
                        {emailData?.bcc && emailData.bcc.length > 0 && (
                          <div className="flex">
                            <span className="w-24 text-end text-gray-500">
                              {t('common.mailDisplay.bcc')}:
                            </span>
                            <span className="text-muted-foreground ml-3">
                              {emailData?.bcc?.map((t) => cleanEmailDisplay(t.email)).join(', ')}
                            </span>
                          </div>
                        )}
                        <div className="flex">
                          <span className="w-24 text-end text-gray-500">
                            {t('common.mailDisplay.date')}:
                          </span>
                          <span className="text-muted-foreground ml-3">
                            {format(new Date(emailData?.receivedOn), 'PPpp')}
                          </span>
                        </div>
                        <div className="flex">
                          <span className="w-24 text-end text-gray-500">
                            {t('common.mailDisplay.mailedBy')}:
                          </span>
                          <span className="text-muted-foreground ml-3">
                            {cleanEmailDisplay(emailData?.sender?.email)}
                          </span>
                        </div>
                        <div className="flex">
                          <span className="w-24 text-end text-gray-500">
                            {t('common.mailDisplay.signedBy')}:
                          </span>
                          <span className="text-muted-foreground ml-3">
                            {cleanEmailDisplay(emailData?.sender?.email)}
                          </span>
                        </div>
                        {emailData.tls && (
                          <div className="flex items-center">
                            <span className="w-24 text-end text-gray-500">
                              {t('common.mailDisplay.security')}:
                            </span>
                            <div className="text-muted-foreground ml-3 flex items-center gap-1">
                              <Lock className="h-4 w-4 text-green-600" />{' '}
                              {t('common.mailDisplay.standardEncryption')}
                            </div>
                          </div>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div> */}
              </div>
            </div>
          </div>
        </div>

        <div
          className={cn(
            'h-0 overflow-hidden transition-all duration-200',
            !isCollapsed && 'h-[1px]',
          )}
        ></div>

        <div
          className={cn(
            'grid overflow-hidden transition-all duration-200',
            isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="h-fit w-full p-0">
              {emailData?.decodedBody ? (
                <MailIframe html={emailData?.decodedBody} senderEmail={emailData.sender.email} />
              ) : (
                <div
                  className="flex h-[500px] w-full items-center justify-center"
                  style={{ minHeight: '500px' }}
                >
                  <div className="bg-secondary h-32 w-32 animate-pulse rounded-full" />
                </div>
              )}
              {emailData?.attachments && emailData?.attachments.length > 0 ? (
                <div className="mb-4 flex items-center gap-2 px-4 pt-4">
                  {emailData?.attachments.map((attachment, index) => (
                    <div key={index}>
                      <button
                        className="flex h-7 items-center gap-1 rounded-[5px] bg-[#FAFAFA] px-4 text-sm font-medium hover:bg-[#F0F0F0] dark:bg-[#262626] dark:hover:bg-[#303030]"
                        onClick={() => {
                          try {
                            // Convert base64 to blob
                            const byteCharacters = atob(attachment.body);
                            const byteNumbers = new Array(byteCharacters.length);
                            for (let i = 0; i < byteCharacters.length; i++) {
                              byteNumbers[i] = byteCharacters.charCodeAt(i);
                            }
                            const byteArray = new Uint8Array(byteNumbers);
                            const blob = new Blob([byteArray], { type: attachment.mimeType });

                            // Create object URL and trigger download
                            const url = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = attachment.filename;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(url);
                          } catch (error) {
                            console.error('Error downloading attachment:', error);
                          }
                        }}
                      >
                        {getFileIcon(attachment.filename)}
                        <span className="text-black dark:text-white">
                          {attachment.filename}
                        </span>{' '}
                        <span className="text-[#6D6D6D] dark:text-[#929292]">
                          {formatFileSize(attachment.size)}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2 px-4 mb-4 mt-3">
                <button
                  onClick={() => {
                    setMode('reply');
                  }}
                  className="inline-flex h-7 items-center justify-center gap-1 overflow-hidden rounded-md bg-white px-1.5 dark:bg-[#313131]"
                >
                  <Reply className="fill-[#6D6D6D] dark:fill-[#9B9B9B]" />
                  <div className="flex items-center justify-center gap-2.5 pl-0.5 pr-1">
                    <div className="justify-start font-['Inter'] text-sm leading-none text-white">
                      Reply
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setMode('reply');
                  }}
                  className="inline-flex h-7 items-center justify-center gap-1 overflow-hidden rounded-md bg-white px-1.5 dark:bg-[#313131]"
                >
                  <ReplyAll className="fill-[#6D6D6D] dark:fill-[#9B9B9B]" />
                  <div className="flex items-center justify-center gap-2.5 pl-0.5 pr-1">
                    <div className="justify-start font-['Inter'] text-sm leading-none text-white">
                      Reply All
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setMode('forward');
                  }}
                  className="inline-flex h-7 items-center justify-center gap-1 overflow-hidden rounded-md bg-white px-1.5 dark:bg-[#313131]"
                >
                  <Forward className="fill-[#6D6D6D] dark:fill-[#9B9B9B]" />
                  <div className="flex items-center justify-center gap-2.5 pl-0.5 pr-1">
                    <div className="justify-start font-['Inter'] text-sm leading-none text-white">
                      Forward
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
        <ReplyCompose />
      </div>
    </div>
  );
};

export default memo(MailDisplay);
