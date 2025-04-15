'use client';

import type { InitialThread, Sender } from '@/types';
import { useSession } from '@/lib/auth-client';
import { useMemo } from 'react';
import axios from 'axios';
import useSWR from 'swr';

interface Contact extends Sender {}

const fetchContacts = async (connectionId: string): Promise<Sender[]> => {
  try {
    const response = await axios.get(`/api/driver?folder=inbox&max=100`);
    const data = response.data;

    const uniqueContacts = new Map<string, Contact>();

    if (data && data.threads && Array.isArray(data.threads)) {
      data.threads.forEach((thread: InitialThread) => {
        const { sender } = thread;

        if (sender && sender.email && !uniqueContacts.has(sender.email)) {
          uniqueContacts.set(sender.email, {
            name: sender.name,
            email: sender.email,
          });
        }
      });
    }

    return Array.from(uniqueContacts.values());
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return [];
  }
};

export const useContacts = () => {
  const { data: session } = useSession();

  const { data, error, isLoading } = useSWR<Sender[]>(
    session?.connectionId ? ['contacts', session.connectionId] : null,
    () => (session?.connectionId ? fetchContacts(session.connectionId) : []),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000,
    },
  );

  const contacts = useMemo(() => data || [], [data]);

  return {
    contacts,
    isLoading,
    error,
  };
};
