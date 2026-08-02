import {
  listDomains,
  listSenders,
  type DomainGroup,
  type SenderGroup,
} from '@/app/local/rpc/local-utils';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { localCaller } from '@/app/local/rpc/router';
import { isLocalActive } from '@/app/local/rpc/bridge';
import useSearchLabels from './use-labels-search';
import { useParams } from 'react-router';
import { useMemo } from 'react';

export type { DomainGroup, SenderGroup };

export const useDomains = () => {
  const { folder } = useParams<{ folder: string }>();
  const { labels } = useSearchLabels();
  return useQuery({
    queryKey: ['local', 'domains', folder, labels],
    queryFn: () => listDomains({ folder, labelIds: labels }),
    enabled: isLocalActive(),
    staleTime: 30 * 1000,
  });
};

export const useSenders = () => {
  const { folder } = useParams<{ folder: string }>();
  const { labels } = useSearchLabels();
  return useQuery({
    queryKey: ['local', 'senders', folder, labels],
    queryFn: () => listSenders({ folder, labelIds: labels }),
    enabled: isLocalActive(),
    staleTime: 30 * 1000,
  });
};

export const useGroupThreads = (filter: { senderEmail?: string; domain?: string }) => {
  const { folder } = useParams<{ folder: string }>();
  const { labels } = useSearchLabels();
  const { senderEmail, domain } = filter;

  const query = useInfiniteQuery({
    queryKey: ['local', 'group-threads', folder, labels, senderEmail, domain],
    queryFn: ({ pageParam }) =>
      localCaller.mail.listThreads({
        folder,
        labelIds: labels,
        senderEmail,
        domain,
        cursor: pageParam || '',
      }),
    initialPageParam: '',
    getNextPageParam: (last: { nextPageToken?: string | null }) => last?.nextPageToken ?? undefined,
    enabled: isLocalActive() && (!!senderEmail || !!domain),
    staleTime: 30 * 1000,
  });

  const threads = useMemo(
    () =>
      query.data
        ? query.data.pages.flatMap((p) => (p as { threads: { id: string }[] }).threads).filter(Boolean)
        : [],
    [query.data],
  );

  return { ...query, threads };
};
