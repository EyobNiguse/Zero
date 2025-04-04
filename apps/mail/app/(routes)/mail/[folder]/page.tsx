import { getMail, markAsRead } from '@/actions/mail';
import { MailLayout } from '@/components/mail/mail';
import { redirect } from 'next/navigation';
import { threadId } from 'worker_threads';
import { ParsedMessage } from '@/types';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

interface MailPageProps {
  params: Promise<{
    folder: string;
  }>;
  searchParams: Promise<{
    threadId: string;
  }>;
}

const ALLOWED_FOLDERS = ['inbox', 'draft', 'sent', 'spam', 'trash', 'archive'];

export default async function MailPage({ params, searchParams }: MailPageProps) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) {
    redirect('/login');
  }

  const { folder } = await params;

  if (!ALLOWED_FOLDERS.includes(folder)) {
    return <div>Invalid folder</div>;
  }

  const { threadId } = await searchParams;
  let threadMessages: ParsedMessage[] = [];
  if (threadId) threadMessages = (await getMail({ id: threadId })) ?? [];
  if (threadMessages && threadMessages.some((e) => e.unread)) void markAsRead({ ids: [threadId] });

  return <MailLayout messages={threadMessages} />;
}
