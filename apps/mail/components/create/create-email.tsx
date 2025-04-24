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
import { EmailComposer } from './email-composer';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-client';
import { truncateFileName } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { AIAssistant } from './ai-assistant';
import { useTranslations } from 'next-intl';
import { sendEmail } from '@/actions/send';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import { type JSONContent } from 'novel';
import { useQueryState } from 'nuqs';
import { useEffect } from 'react';
import posthog from 'posthog-js';
import { toast } from 'sonner';
import * as React from 'react';
import './prosemirror.css';

export function CreateEmail({
  initialTo = '',
  initialSubject = '',
  initialBody = '',
}: {
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
}) {
  const [draftId, setDraftId] = useQueryState('draftId');
  const { settings } = useSettings();
  const { enableScope, disableScope } = useHotkeysContext();
  const [isCardHovered, setIsCardHovered] = React.useState(false);
  const dragCounter = React.useRef(0);
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

  const handleSendEmail = async (data: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    message: string;
    attachments: File[];
  }) => {
    try {
      // Use the selected from email or the first alias (or default user email)
      const fromEmail = aliases?.[0]?.email ?? userEmail;

      await sendEmail({
        to: data.to.map((email) => ({ email, name: email.split('@')[0] || email })),
        cc: data.cc?.map((email) => ({ email, name: email.split('@')[0] || email })),
        bcc: data.bcc?.map((email) => ({ email, name: email.split('@')[0] || email })),
        subject: data.subject,
        message: data.message,
        attachments: data.attachments,
        fromEmail: fromEmail,
      });

      // Track different email sending scenarios
      if (data.cc && data.bcc) {
        console.log(posthog.capture('Create Email Sent with CC and BCC'));
      } else if (data.cc) {
        console.log(posthog.capture('Create Email Sent with CC'));
      } else if (data.bcc) {
        console.log(posthog.capture('Create Email Sent with BCC'));
      } else {
        console.log(posthog.capture('Create Email Sent'));
      }

      toast.success(t('pages.createEmail.emailSentSuccessfully'));
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error(t('pages.createEmail.failedToSendEmail'));
    }
  };

  const t = useTranslations();

  return (
    <>
      <div className="flex min-h-screen flex-col items-center justify-center gap-1">
        <div className="flex w-[750px] justify-start">
          <DialogClose asChild className="flex">
            <button className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 dark:bg-[#1A1A1A]">
              <X className="mt-0.5 h-3.5 w-3.5 fill-black dark:fill-[#929292]" />
              <span className="text-sm text-black dark:text-white">esc</span>
            </button>
          </DialogClose>
        </div>
        <EmailComposer onSendEmail={handleSendEmail} />
      </div>
    </>
  );
}
