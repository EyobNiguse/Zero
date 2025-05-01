'use client';
import { GetState, GetSummary } from '@/actions/getSummary';
import { useSession } from '@/lib/auth-client';
import useSWR from 'swr';

export const useSummary = (threadId: string | null) => {
  const { data: session } = useSession();
  const { data, isLoading } = useSWR<{ short: string; long: string } | null>(
    session && threadId ? `ai:summary:${threadId}` : null,
    async () => {
      if (!threadId) return null;
      return await GetSummary(threadId);
    },
  );

  return { data, isLoading };
};

export const useBrainState = () => {
  const { data: session } = useSession();
  const { data, isLoading } = useSWR<{ enabled: boolean } | null>(
    session ? `brain:state:${session?.connectionId}` : null,
    async () => {
      return await GetState();
    },
  );

  return { data, isLoading };
};
