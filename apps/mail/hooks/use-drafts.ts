/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { InitialThread, ParsedMessage } from "@/types";
import { useSession } from "@/lib/auth-client";
import { getDrafts } from "@/actions/drafts";
import useSWRInfinite from "swr/infinite";
import { getMail } from "@/actions/mail";
import useSWR, { preload } from "swr";
import { useMemo } from "react";

export const preloadThread = (userId: string, threadId: string, connectionId: string) => {
  console.log(`🔄 Prefetching email ${threadId}...`);
  preload([userId, threadId, connectionId], fetchThread);
};

// TODO: improve the filters
const fetchEmails = async (args: any[]) => {
  const [_1, _2, query, max, _3, pageToken] = args;

  const data = await getDrafts({ q: query, max, pageToken });

  return data;
};

const fetchThread = async (args: any[]) => {
  const [_, id] = args;
  const data = await getMail({ id });
  return data;
};

// Based on gmail
interface RawResponse {
  nextPageToken: string | undefined;
  threads: InitialThread[];
  resultSizeEstimate: number;
}

const getKey = (
  pageIndex: number,
  previousPageData: RawResponse | null,
  userId: string,
  query?: string,
  max?: number,
  connectionId?: string,
) => {
  if (previousPageData && !previousPageData.nextPageToken) return null;

  if (pageIndex === 0) {
    return [userId, query, max, undefined, connectionId];
  }

  return [userId, query, max, previousPageData?.nextPageToken, connectionId];
};

export const useDrafts = (query?: string, max?: number) => {
  const { data: session } = useSession();

  const { data, error, size, setSize, isLoading, isValidating, mutate } =
    useSWRInfinite<RawResponse>(
      (pageIndex, previousPageData) =>
        session?.user.id
          ? getKey(
              pageIndex,
              previousPageData,
              session.user.id,
              query,
              max,
              session.connectionId ?? undefined,
            )
          : null,
      fetchEmails as any,
      {
        revalidateOnMount: true,
        revalidateIfStale: true,
        revalidateAll: false,
        revalidateFirstPage: true,
      },
    );

  const threads = data ? data.flatMap((page) => page.threads) : [];
  const isEmpty = data?.[0]?.threads.length === 0;
  const isReachingEnd = isEmpty || (data && !data[data.length - 1]?.nextPageToken);
  const loadMore = () => setSize(size + 1);

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

export const useDraft = (id: string) => {
  const { data: session } = useSession();

  const { data, isLoading, error, mutate } = useSWR<ParsedMessage[]>(
    session?.user.id ? [session.user.id, id, session.connectionId] : null,
    fetchThread as any,
  );

  const hasUnread = useMemo(() => data?.some((e) => e.unread), [data]);

  return { data, isLoading, error, hasUnread, mutate };
};
