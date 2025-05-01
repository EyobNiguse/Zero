'use client';
import { GetSummary } from '@/actions/getSummary';
import useSWR from 'swr';

export const useSummary = (threadId: string | null) => {
  const { data } = useSWR(threadId ? `ai:summary:${threadId}` : null, async () => {
    if (!threadId) return null;
    return await GetSummary(threadId);
  });

  return { data };
};
