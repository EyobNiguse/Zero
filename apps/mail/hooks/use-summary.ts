'use client';
import { GetSummary } from '@/actions/getSummary';
import { string } from 'zod';
import useSWR from 'swr';

export const useSummary = (threadId: string | null) => {
  const { data } = useSWR<{ short: string; long: string } | null>(
    threadId ? `ai:summary:${threadId}` : null,
    async () => {
      if (!threadId) return null;
      return await GetSummary(threadId);
    },
  );

  return { data };
};
