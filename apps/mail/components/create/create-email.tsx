'use client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CurvedArrow,
  Lightning,
  MediumStack,
  ShortStack,
  LongStack,
  Smile,
  ThreeDots,
  X,
} from '../icons/icons';
import {
  ArrowUpIcon,
  MinusCircle,
  Paperclip,
  PlusCircle,
  ChevronDown,
  Plus,
  Command,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UploadedFileIcon } from '@/components/create/uploaded-file-icon';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useEmailAliases } from '@/hooks/use-email-aliases';
import { generateHTML, generateJSON } from '@tiptap/core';
import { useConnections } from '@/hooks/use-connections';
import { createDraft, getDraft } from '@/actions/drafts';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { Separator } from '@/components/ui/separator';
import { DialogClose } from '@/components/ui/dialog';
import { SidebarToggle } from '../ui/sidebar-toggle';
import Paragraph from '@tiptap/extension-paragraph';
import { useSettings } from '@/hooks/use-settings';
import { useContacts } from '@/hooks/use-contacts';
import Document from '@tiptap/extension-document';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-client';
import { truncateFileName } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { AIAssistant } from './ai-assistant';
import { useTranslations } from 'next-intl';
import { sendEmail } from '@/actions/send';
import { EmailInput } from './email-input';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import { type JSONContent } from 'novel';
import { useQueryState } from 'nuqs';
import { useEffect } from 'react';
import posthog from 'posthog-js';
import { toast } from 'sonner';
import * as React from 'react';
import Editor from './editor';
import './prosemirror.css';
import { EmailComposer } from './email-composer';

const MAX_VISIBLE_ATTACHMENTS = 12;

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Add a more lenient check for partial emails
const isPartialEmail = (email: string): boolean => {
  return email.includes('@');
};

const createEmptyDocContent = (): JSONContent => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [],
    },
  ],
});

const filterContacts = (contacts: any[], searchTerm: string, excludeEmails: string[]) => {
  if (!searchTerm) return [];
  const term = searchTerm.toLowerCase();
  return contacts.filter(
    (contact) =>
      (contact.email?.toLowerCase().includes(term) || contact.name?.toLowerCase().includes(term)) &&
      !excludeEmails.includes(contact.email),
  );
};

export function CreateEmail({
  initialTo = '',
  initialSubject = '',
  initialBody = '',
}: {
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
}) {
  const [toEmails, setToEmails] = React.useState<string[]>(initialTo ? [initialTo] : []);
  const [toInput, setToInput] = React.useState('');
  const [ccInput, setCcInput] = React.useState('');
  const [ccEmails, setCcEmails] = React.useState<string[]>([]);
  const [bccInput, setBccInput] = React.useState('');
  const [bccEmails, setBccEmails] = React.useState<string[]>([]);
  const [showCc, setShowCc] = React.useState(false);
  const [showBcc, setShowBcc] = React.useState(false);
  const [selectedFromEmail, setSelectedFromEmail] = React.useState<string | null>(null);
  const [subjectInput, setSubjectInput] = React.useState(initialSubject);
  const [attachments, setAttachments] = React.useState<File[]>([]);
  const [resetEditorKey, setResetEditorKey] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [messageContent, setMessageContent] = React.useState(initialBody);
  const [draftId, setDraftId] = useQueryState('draftId');
  const [includeSignature, setIncludeSignature] = React.useState(true);
  const { settings } = useSettings();
  const { enableScope, disableScope } = useHotkeysContext();
  const [isCardHovered, setIsCardHovered] = React.useState(false);
  const dragCounter = React.useRef(0);
  const [messageLength, setMessageLength] = React.useState(0);

  const handleSendEmail = async () => {
    if (!toEmails.length) {
      toast.error('Please enter at least one recipient email address');
      return;
    }

    if (!messageContent.trim() || messageContent === JSON.stringify(defaultValue)) {
      toast.error('Please enter a message');
      return;
    }

    if (!subjectInput.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    try {
      setIsLoading(true);

      // Use the selected from email or the first alias (or default user email)
      const fromEmail = selectedFromEmail || (aliases?.[0]?.email ?? userEmail);

      await sendEmail({
        to: toEmails.map((email) => ({ email, name: email.split('@')[0] || email })),
        cc: showCc
          ? ccEmails.map((email) => ({ email, name: email.split('@')[0] || email }))
          : undefined,
        bcc: showBcc
          ? bccEmails.map((email) => ({ email, name: email.split('@')[0] || email }))
          : undefined,
        subject: subjectInput,
        message: messageContent,
        attachments: attachments,
        fromEmail: fromEmail,
      });

      // Track different email sending scenarios
      if (showCc && showBcc) {
        console.log(posthog.capture('Create Email Sent with CC and BCC'));
      } else if (showCc) {
        console.log(posthog.capture('Create Email Sent with CC'));
      } else if (showBcc) {
        console.log(posthog.capture('Create Email Sent with BCC'));
      } else {
        console.log(posthog.capture('Create Email Sent'));
      }

      // Clear all input fields and reset state
      setToInput('');
      setToEmails([]);
      setCcInput('');
      setCcEmails([]);
      setBccInput('');
      setBccEmails([]);
      setShowCc(false);
      setShowBcc(false);
      setSubjectInput('');
      setAttachments([]);
      setMessageContent('');
      setMessageLength(0);
      setDefaultValue(createEmptyDocContent());
      setResetEditorKey((prev) => prev + 1);
      setHasUnsavedChanges(false);
      setSelectedFromEmail(null);

      setIsLoading(false);
      toast.success(t('pages.createEmail.emailSentSuccessfully'));
    } catch (error) {
      console.error('Error sending email:', error);
      setIsLoading(false);
      toast.error(t('pages.createEmail.failedToSendEmail'));
    }
  };

  // Add hotkey handler for command+send
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSendEmail();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSendEmail]);

  const [defaultValue, setDefaultValue] = React.useState<JSONContent | null>(() => {
    if (initialBody) {
      try {
        return generateJSON(initialBody, [Document, Paragraph, Text, Bold]);
      } catch (error) {
        console.error('Error parsing initial body:', error);
        return createEmptyDocContent();
      }
    }
    return null;
  });

  const { data: session } = useSession();
  const { data: connections } = useConnections();
  const { aliases, isLoading: isLoadingAliases } = useEmailAliases();

  const activeAccount = React.useMemo(() => {
    if (!session) return null;
    return connections?.find((connection) => connection.id === session?.activeConnection?.id);
  }, [session, connections]);

  const userName =
    activeAccount?.name || session?.activeConnection?.name || session?.user?.name || '';
  const userEmail =
    activeAccount?.email || session?.activeConnection?.email || session?.user?.email || '';

  React.useEffect(() => {
    if (!draftId && !defaultValue) {
      setDefaultValue(createEmptyDocContent());
    }
  }, [draftId, defaultValue]);

  React.useEffect(() => {
    const loadDraft = async () => {
      if (!draftId) {
        setDefaultValue(createEmptyDocContent());
        return;
      }

      try {
        const draft = await getDraft(draftId);

        if (!draft) {
          toast.error('Draft not found');
          return;
        }

        setDraftId(draft.id);

        if (draft.to?.length) {
          setToEmails(draft.to);
        }
        if (draft.subject) {
          setSubjectInput(draft.subject);
        }

        if (draft.content) {
          try {
            setMessageContent(draft.content);
            setResetEditorKey((prev) => prev + 1);
            setTimeout(() => {
              try {
                const json = generateJSON(draft.content, [Document, Paragraph, Text, Bold]);
                setDefaultValue(json);
              } catch (error) {
                console.error('Error parsing draft content:', error);
                setDefaultValue(createEmptyDocContent());
              }
            }, 0);
          } catch (error) {
            console.error('Error setting draft content:', error);
            setDefaultValue(createEmptyDocContent());
          }
        } else {
          setDefaultValue(createEmptyDocContent());
          setMessageContent('');
        }

        setHasUnsavedChanges(false);
      } catch (error) {
        console.error('Error loading draft:', error);
        toast.error('Failed to load draft');
      }
    };

    loadDraft();
  }, [draftId]);

  const t = useTranslations();

  return (
    <>
      <div className="flex flex-col gap-1 min-h-screen items-center justify-center">
        <div className='flex justify-start w-[750px]'>
          <DialogClose asChild className='flex'>
            <button className="flex items-center gap-1 rounded-lg px-2 py-1.5 bg-white dark:bg-[#1A1A1A]">
              <X className="mt-0.5 h-3.5 w-3.5 fill-black dark:fill-[#929292]" />
              <span className="text-sm text-black dark:text-white">esc</span>
            </button>
          </DialogClose>
        </div>
        <EmailComposer
          toEmails={toEmails}
          setToEmails={setToEmails}
          toInput={toInput}
          setToInput={setToInput}
          ccEmails={ccEmails}
          setCcEmails={setCcEmails}
          ccInput={ccInput}
          setCcInput={setCcInput}
          bccEmails={bccEmails}
          setBccEmails={setBccEmails}
          bccInput={bccInput}
          setBccInput={setBccInput}
          showCc={showCc}
          setShowCc={setShowCc}
          showBcc={showBcc}
          setShowBcc={setShowBcc}
          subjectInput={subjectInput}
          setSubjectInput={setSubjectInput}
          messageContent={messageContent}
          setMessageContent={setMessageContent}
          messageLength={messageLength}
          setMessageLength={setMessageLength}
          attachments={attachments}
          setAttachments={setAttachments}
          isLoading={isLoading}
          hasUnsavedChanges={hasUnsavedChanges}
          setHasUnsavedChanges={setHasUnsavedChanges}
          onSendEmail={handleSendEmail}
        />
      </div>
    </>
  );
}
