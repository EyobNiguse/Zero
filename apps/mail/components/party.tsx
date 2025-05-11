'use client';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { useTRPC } from '@/providers/query-provider';
import { usePartySocket } from 'partysocket/react';
import { useSession } from '@/lib/auth-client';
import { useEffect } from 'react';

export const NotificationProvider = ({ headers }: { headers: Record<string, string> }) => {
  //   const trpc = useTRPC();
  const { data: session } = useSession();

  usePartySocket({
    party: 'durable-mailbox',
    room: session?.activeConnection?.email ? `${session.activeConnection.email}` : 'general',
    prefix: 'zero',
    debug: true,
    maxRetries: 1,
    query: {
      token: headers['cookie'],
    },
    host: process.env.NEXT_PUBLIC_BACKEND_URL!,
    onMessage: (message) => {
      console.log(message);
    },
  });

  return <></>;
};
