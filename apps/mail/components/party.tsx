'use client';
import { useQueryClient } from '@tanstack/react-query';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { useTRPC } from '@/providers/query-provider';
import { usePartySocket } from 'partysocket/react';
import { useSession } from '@/lib/auth-client';
import { useEffect } from 'react';

export const NotificationProvider = ({ headers }: { headers: Record<string, string> }) => {
  const trpc = useTRPC();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  usePartySocket({
    party: 'durable-mailbox',
    room: session?.activeConnection?.id ? `${session.activeConnection.id}` : 'general',
    prefix: 'zero',
    debug: true,
    maxRetries: 1,
    query: {
      token: headers['cookie'],
    },
    host: process.env.NEXT_PUBLIC_BACKEND_URL!,
    onMessage: (message: MessageEvent<string>) => {
      const [threadId, type] = message.data.split(':');
      if (type === 'end') {
        console.log('invalidating thread', threadId);
        queryClient.invalidateQueries({
          queryKey: trpc.mail.get.queryKey({ id: threadId }),
        });
      }
      console.log('party message', threadId, type);
    },
  });

  return <></>;
};
