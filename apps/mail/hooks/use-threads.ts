'use client';

import { getMail, getMails, markAsRead } from '@/actions/mail';
import { useParams, useSearchParams } from 'next/navigation';
import type { InitialThread, ParsedMessage } from '@/types';
import { useSearchValue } from '@/hooks/use-search-value';
import { useSession } from '@/lib/auth-client';
import { defaultPageSize } from '@/lib/utils';
import useSWRInfinite from 'swr/infinite';
import useSWR, { preload } from 'swr';
import { useMemo } from 'react';

export const preloadThread = async (userId: string, threadId: string, connectionId: string) => {
  console.log(`🔄 Prefetching email ${threadId}...`);
  await preload([userId, threadId, connectionId], fetchThread(undefined));
};

type FetchEmailsTuple = [
  connectionId: string,
  folder: string,
  q?: string,
  max?: number,
  labelIds?: string[],
  pageToken?: string | number,
];

// TODO: improve the filters
const fetchEmails = async ([
  _,
  folder,
  q,
  max,
  labelIds,
  pageToken,
]: FetchEmailsTuple): Promise<RawResponse> => {
  try {
    const data = await getMails({ folder, q, max, labelIds, pageToken });
    return data as RawResponse;
  } catch (error) {
    console.error('Error fetching emails:', error);
    throw error;
  }
};

const fetchThread = (cb: any) => async (args: any[]) => {
  const [_, id] = args;
  try {
    return await getMail({ id }).then((response) => {
      if (response) {
        if (cb) {
          const unreadMessages = response.filter((e) => e.unread).map((e) => e.id);
          if (unreadMessages.length) {
            markAsRead({ ids: unreadMessages }).then(() => {
              if (cb && typeof cb === 'function') cb();
            });
          }
        }
        return response;
      }
    });
  } catch (error) {
    console.error('Error fetching email:', error);
    throw error;
  }
};

// Based on gmail
interface RawResponse {
  nextPageToken: string | undefined;
  threads: InitialThread[];
  resultSizeEstimate: number;
}

const getKey = (
  previousPageData: RawResponse | null,
  [connectionId, folder, query, max, labelIds]: FetchEmailsTuple,
): FetchEmailsTuple | null => {
  if (previousPageData && !previousPageData.nextPageToken) return null; // reached the end

  console.log('got key', [
    connectionId,
    folder,
    query,
    max,
    labelIds,
    previousPageData ? previousPageData.nextPageToken : '0',
  ]);

  return [
    connectionId,
    folder,
    query,
    max,
    labelIds,
    previousPageData ? previousPageData.nextPageToken : 0,
  ];
};

export const useThreads = () => {
  const { folder } = useParams<{ folder: string }>();
  const [searchValue] = useSearchValue();
  const { data: session } = useSession();

  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite(
    (_, previousPageData) => {
      if (!session?.user.id || !session.connectionId) return null;
      return getKey(previousPageData, [
        session.connectionId,
        folder,
        searchValue.value,
        defaultPageSize,
      ]);
    },
    fetchEmails,
  );

  // Flatten threads from all pages and sort by receivedOn date (newest first)
  const threads = useMemo(
    () =>
      data
        ? data
            .flatMap((e) => e.threads)
            .sort((a, b) => {
              // Parse dates and compare them (newest first)
              const dateA = new Date(a.receivedOn || '');
              const dateB = new Date(b.receivedOn || '');
              return dateB.getTime() - dateA.getTime();
            })
        : [],
    [data],
  );
  const isEmpty = useMemo(() => threads.length === 0, [threads]);
  const isReachingEnd = isEmpty || (data && !data[data.length - 1]?.nextPageToken);
  const loadMore = async () => {
    if (isLoading || isValidating) return;
    await setSize(size + 1);
  };

  return {
    data: {
      threads,
      nextPageToken: data?.[data.length - 1]?.nextPageToken,
    },
    isLoading,
    isValidating,
    error,
    loadMore,
    isReachingEnd,
    mutate,
  };
};

export const useThread = (threadId?: string) => {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const id = threadId ? threadId : searchParams.get('threadId');
  const { mutate: mutateThreads } = useThreads();

  const { data, isLoading, error, mutate } = useSWR<ParsedMessage[]>(
    session?.user.id && id ? [session.user.id, id, session.connectionId] : null,
    fetchThread(mutateThreads) as any,
  );

  const hasUnread = useMemo(() => data?.some((e) => e.unread), [data]);

  return { data, isLoading, error, hasUnread, mutate };
};
