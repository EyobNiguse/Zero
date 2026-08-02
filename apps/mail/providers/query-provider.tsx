import {
  PersistQueryClientProvider,
  type PersistedClient,
  type Persister,
} from '@tanstack/react-query-persist-client';
import { QueryCache, QueryClient, hashKey, type InfiniteData } from '@tanstack/react-query';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { createTRPCClient, unstable_localLink, type TRPCLink } from '@trpc/client';
import { useMemo, type PropsWithChildren } from 'react';
import type { AppRouter } from '@zero/server/trpc';
import { localRouter } from '@/app/local/rpc/router';
import { CACHE_BURST_KEY } from '@/lib/constants';
import { signOut } from '@/lib/auth-client';
import { get, set, del } from 'idb-keyval';

function createIDBPersister(idbValidKey: IDBValidKey = 'zero-query-cache') {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(idbValidKey, client);
    },
    restoreClient: async () => {
      return await get<PersistedClient>(idbValidKey);
    },
    removeClient: async () => {
      await del(idbValidKey);
    },
  } satisfies Persister;
}

export const makeQueryClient = (connectionId: string | null) =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (err, { meta }) => {
        if (meta && meta.noGlobalError === true) return;
        // Browser-first mode: never sign out / redirect to /login on query errors
        // (the backend is intentionally absent).
        const localMode = typeof window !== 'undefined' && !!localStorage.getItem('local.provider');
        if (localMode) {
          console.error(err.message , 'query error (local mode)');
          return; 
        }
        if (meta && typeof meta.customError === 'string') console.error(meta.customError);
        else if (
          err.message === 'Required scopes missing' ||
          err.message.includes('Invalid connection')
        ) {
          signOut({
            fetchOptions: {
              onSuccess: () => {
                if (window.location.href.includes('/login')) return;
                window.location.href = '/login?error=required_scopes_missing';
              },
            },
          });
        } else console.error(err.message || 'Something went wrong');
      },
    }),
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        queryKeyHashFn: (queryKey) => hashKey([{ connectionId }, ...queryKey]),
        gcTime: 1000 * 60 * 60 * 24, // 24 hours,
      },
      mutations: {
        onError: (err) => console.error(err.message),
      },
    },
  });

let browserQueryClient = {
  queryClient: null,
  activeConnectionId: null,
} as {
  queryClient: QueryClient | null;
  activeConnectionId: string | null;
};

const getQueryClient = (connectionId: string | null) => {
  if (typeof window === 'undefined') {
    return makeQueryClient(connectionId);
  } else {
    if (!browserQueryClient.queryClient || browserQueryClient.activeConnectionId !== connectionId) {
      browserQueryClient.queryClient = makeQueryClient(connectionId);
      browserQueryClient.activeConnectionId = connectionId;
    }
    return browserQueryClient.queryClient;
  }
};

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

/**
 * The whole backend: every procedure runs in-process against browser SQLite. No HTTP, no transport,
 * no transformer.
 *
 * The cast is because the client is still typed against the server's AppRouter; it goes when that
 * flips to `typeof localRouter`.
 */
const localRouterLink = unstable_localLink({
  router: localRouter,
  // dbProcedure/driverProcedure build the real ctx per call.
  createContext: async () => ({}),
}) as unknown as TRPCLink<AppRouter>;

export const trpcClient = createTRPCClient<AppRouter>({
  links: [localRouterLink],
});

type TrpcHook = ReturnType<typeof useTRPC>;
export function QueryProvider({
  children,
  connectionId,
}: PropsWithChildren<{ connectionId: string | null }>) {
  const persister = useMemo(
    () => createIDBPersister(`zero-query-cache-${connectionId ?? 'default'}`),
    [connectionId],
  );
  const queryClient = useMemo(() => getQueryClient(connectionId), [connectionId]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: CACHE_BURST_KEY,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
      }}
      onSuccess={() => {
        const threadQueryKey = [['mail', 'listThreads'], { type: 'infinite' }];
        queryClient.setQueriesData(
          { queryKey: threadQueryKey },
          (data: InfiniteData<TrpcHook['mail']['listThreads']['~types']['output']>) => {
            if (!data) return data;
            // We only keep few pages of threads in the cache before we invalidate them
            // invalidating will attempt to refetch every page that was in cache, if someone have too many pages in cache, it will refetch every page every time
            // We don't want that, just keep like 3 pages (20 * 3 = 60 threads) in cache
            return {
              pages: data.pages.slice(0, 3),
              pageParams: data.pageParams.slice(0, 3),
            };
          },
        );
        // invalidate the query, it will refetch when the data is it is being accessed
        queryClient.invalidateQueries({ queryKey: threadQueryKey });
      }}
    >
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </PersistQueryClientProvider>
  );
}
