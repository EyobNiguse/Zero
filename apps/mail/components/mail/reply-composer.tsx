'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useEmailAliases } from '@/hooks/use-email-aliases';
import { useHotkeysContext } from 'react-hotkeys-hook';
import { useThread } from '@/hooks/use-threads';
import { useSession } from '@/lib/auth-client';
import { useTranslations } from 'next-intl';
import { sendEmail } from '@/actions/send';
import { useQueryState } from 'nuqs';
import { constructReplyBody } from '@/lib/utils';
import { EmailComposer } from '../create/email-composer';
import { toast } from 'sonner';
import { Sender } from '@/types';

export default function ReplyCompose() {
  const [threadId] = useQueryState('threadId');
  const { data: emailData, mutate } = useThread(threadId);
  const { data: session } = useSession();
  const [mode, setMode] = useQueryState('mode');
  const { enableScope, disableScope } = useHotkeysContext();
  const { aliases, isLoading: isLoadingAliases } = useEmailAliases();
  const t = useTranslations();

  // State for EmailComposer
  const [toEmails, setToEmails] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState('');
  const [bccEmails, setBccEmails] = useState<string[]>([]);
  const [bccInput, setBccInput] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [selectedFromEmail, setSelectedFromEmail] = useState<string | null>(null);
  const [subjectInput, setSubjectInput] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [messageLength, setMessageLength] = useState(0);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Initialize recipients and subject when mode changes
  useEffect(() => {
    if (!emailData?.latest || !mode || !session?.activeConnection?.email) return;

    const userEmail = session.activeConnection.email.toLowerCase();
    const latestEmail = emailData.latest;
    const senderEmail = latestEmail.sender.email.toLowerCase();

    // Reset states
    setToEmails([]);
    setCcEmails([]);
    setBccEmails([]);
    setShowCc(false);
    setShowBcc(false);

    // Set subject based on mode
    const subject = mode === 'forward'
      ? `Fwd: ${latestEmail.subject || ''}`
      : latestEmail.subject?.startsWith('Re:')
        ? latestEmail.subject
        : `Re: ${latestEmail.subject || ''}`;
    setSubjectInput(subject);

    if (mode === 'reply') {
      // Reply to sender
      setToEmails([latestEmail.sender.email]);
    } else if (mode === 'replyAll') {
      const to: string[] = [];
      const cc: string[] = [];

      // Add original sender if not current user
      if (senderEmail !== userEmail) {
        to.push(latestEmail.sender.email);
      }

      // Add original recipients from To field
      latestEmail.to?.forEach(recipient => {
        const recipientEmail = recipient.email.toLowerCase();
        if (recipientEmail !== userEmail && recipientEmail !== senderEmail) {
          to.push(recipient.email);
        }
      });

      // Add CC recipients
      latestEmail.cc?.forEach(recipient => {
        const recipientEmail = recipient.email.toLowerCase();
        if (recipientEmail !== userEmail && !to.includes(recipient.email)) {
          cc.push(recipient.email);
        }
      });

      // Add BCC recipients
      latestEmail.bcc?.forEach(recipient => {
        const recipientEmail = recipient.email.toLowerCase();
        if (recipientEmail !== userEmail && !to.includes(recipient.email) && !cc.includes(recipient.email)) {
          setBccEmails(prev => [...prev, recipient.email]);
          setShowBcc(true);
        }
      });

      setToEmails(to);
      if (cc.length > 0) {
        setCcEmails(cc);
        setShowCc(true);
      }
    }
    // For forward, we start with empty recipients
  }, [mode, emailData?.latest, session?.activeConnection?.email]);

  const handleSendEmail = async () => {
    if (!emailData?.latest || !session?.activeConnection?.email) return;
    
    try {
      setIsLoading(true);
      const originalEmail = emailData.latest;
      const userEmail = session.activeConnection.email.toLowerCase();

      // Convert email strings to Sender objects
      const toRecipients: Sender[] = toEmails.map(email => ({
        email,
        name: email.split('@')[0] || 'User',
      }));

      const ccRecipients: Sender[] | undefined = showCc
        ? ccEmails.map(email => ({
            email,
            name: email.split('@')[0] || 'User',
          }))
        : undefined;

      const bccRecipients: Sender[] | undefined = showBcc
        ? bccEmails.map(email => ({
            email,
            name: email.split('@')[0] || 'User',
          }))
        : undefined;

      const replyBody = constructReplyBody(
        messageContent,
        new Date(originalEmail.receivedOn || '').toLocaleString(),
        originalEmail.sender,
        toRecipients,
        originalEmail.decodedBody,
      );

      await sendEmail({
        to: toRecipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject: subjectInput,
        message: replyBody,
        attachments,
        fromEmail: selectedFromEmail || aliases?.[0]?.email || userEmail,
        headers: {
          'In-Reply-To': originalEmail.messageId ?? '',
          References: [
            ...(originalEmail.references?.split(' ') || []),
            originalEmail.messageId,
          ].filter(Boolean).join(' '),
          'Thread-Id': originalEmail.threadId ?? '',
        },
        threadId: originalEmail.threadId,
      });

      // Reset states
      setMode(null);
      setToEmails([]);
      setCcEmails([]);
      setBccEmails([]);
      setMessageContent('');
      setAttachments([]);
      setHasUnsavedChanges(false);

      await mutate();
      toast.success(t('pages.createEmail.emailSentSuccessfully'));
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error(t('pages.createEmail.failedToSendEmail'));
    } finally {
      setIsLoading(false);
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
    <div className="w-full bg-white dark:bg-[#141414] rounded-xl">
      <EmailComposer
        className="!max-w-none w-full dark:bg-[#141414] pb-1  border"
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
  );
}
