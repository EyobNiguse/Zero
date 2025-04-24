'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useEmailAliases } from '@/hooks/use-email-aliases';
import { EmailComposer } from '../create/email-composer';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { constructReplyBody } from '@/lib/utils';
import { useThread } from '@/hooks/use-threads';
import { useSession } from '@/lib/auth-client';
import { useTranslations } from 'next-intl';
import { sendEmail } from '@/actions/send';
import { useQueryState } from 'nuqs';
import { Sender } from '@/types';
import { toast } from 'sonner';

export default function ReplyCompose() {
  const [threadId] = useQueryState('threadId');
  const { data: emailData, mutate } = useThread(threadId);
  const { data: session } = useSession();
  const [mode, setMode] = useQueryState('mode');
  const { enableScope, disableScope } = useHotkeysContext();
  const { aliases, isLoading: isLoadingAliases } = useEmailAliases();
  const t = useTranslations();

  // Initialize recipients and subject when mode changes
  useEffect(() => {
    if (!emailData?.latest || !mode || !session?.activeConnection?.email) return;

    const userEmail = session.activeConnection.email.toLowerCase();
    const latestEmail = emailData.latest;
    const senderEmail = latestEmail.sender.email.toLowerCase();

    // Set subject based on mode
    const subject =
      mode === 'forward'
        ? `Fwd: ${latestEmail.subject || ''}`
        : latestEmail.subject?.startsWith('Re:')
          ? latestEmail.subject
          : `Re: ${latestEmail.subject || ''}`;

    if (mode === 'reply') {
      // Reply to sender
    } else if (mode === 'replyAll') {
      const to: string[] = [];
      const cc: string[] = [];

      // Add original sender if not current user
      if (senderEmail !== userEmail) {
        to.push(latestEmail.sender.email);
      }

      // Add original recipients from To field
      latestEmail.to?.forEach((recipient) => {
        const recipientEmail = recipient.email.toLowerCase();
        if (recipientEmail !== userEmail && recipientEmail !== senderEmail) {
          to.push(recipient.email);
        }
      });

      // Add CC recipients
      latestEmail.cc?.forEach((recipient) => {
        const recipientEmail = recipient.email.toLowerCase();
        if (recipientEmail !== userEmail && !to.includes(recipient.email)) {
          cc.push(recipient.email);
        }
      });
    }
    // For forward, we start with empty recipients
  }, [mode, emailData?.latest, session?.activeConnection?.email]);

  const handleSendEmail = async (data: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    message: string;
    attachments: File[];
  }) => {
    if (!emailData?.latest || !session?.activeConnection?.email) return;

    try {
      const originalEmail = emailData.latest;
      const userEmail = session.activeConnection.email.toLowerCase();

      // Convert email strings to Sender objects
      const toRecipients: Sender[] = data.to.map((email) => ({
        email,
        name: email.split('@')[0] || 'User',
      }));

      const ccRecipients: Sender[] | undefined = data.cc
        ? data.cc.map((email) => ({
            email,
            name: email.split('@')[0] || 'User',
          }))
        : undefined;

      const bccRecipients: Sender[] | undefined = data.bcc
        ? data.bcc.map((email) => ({
            email,
            name: email.split('@')[0] || 'User',
          }))
        : undefined;

      const replyBody = constructReplyBody(
        data.message,
        new Date(originalEmail.receivedOn || '').toLocaleString(),
        originalEmail.sender,
        toRecipients,
        originalEmail.decodedBody,
      );

      await sendEmail({
        to: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject: data.subject,
        message: replyBody,
        attachments: data.attachments,
        fromEmail: aliases?.[0]?.email || userEmail,
        headers: {
          'In-Reply-To': originalEmail.messageId ?? '',
          References: [...(originalEmail.references?.split(' ') || []), originalEmail.messageId]
            .filter(Boolean)
            .join(' '),
          'Thread-Id': originalEmail.threadId ?? '',
        },
        threadId: originalEmail.threadId,
      });

      // Reset states
      setMode(null);
      await mutate();
      toast.success(t('pages.createEmail.emailSentSuccessfully'));
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error(t('pages.createEmail.failedToSendEmail'));
    }
  };

  useEffect(() => {
    if (mode) {
      enableScope('compose');
    } else {
      disableScope('compose');
    }
    return () => {
      disableScope('compose');
    };
  }, [mode, enableScope, disableScope]);

  if (!mode || !emailData) return null;

  return (
    <div className="w-full rounded-xl bg-white dark:bg-[#141414]">
      <EmailComposer
        className="w-full !max-w-none border pb-1 dark:bg-[#141414]"
        onSendEmail={handleSendEmail}
      />
    </div>
  );
}
