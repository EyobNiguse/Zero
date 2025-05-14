import { NextIntlClientProvider } from 'next-intl';
import { QueryProvider } from './query-provider';
import { AutumnProvider } from 'autumn-js/next';
import { authClient } from '@/lib/auth-client';
import { getMessages } from 'next-intl/server';
import type { PropsWithChildren } from 'react';
import { unstable_cache } from 'next/cache';
import { headers } from 'next/headers';
import { Suspense } from 'react';

export const runtime = 'edge';

const getCachedSession = unstable_cache(
  async (headersList: Headers) => {
    try {
      return await authClient.getSession({
        fetchOptions: {
          headers: headersList,
          next: { revalidate: 60 },
          cache: 'force-cache',
        },
      });
    } catch (error) {
      console.error('Failed to fetch session:', error);
      return { data: null };
    }
  },
  ['session'],
  { revalidate: 60, tags: ['session'] },
);

async function SessionProvider({ children }: PropsWithChildren) {
  const headersList = await headers();
  const session = await getCachedSession(headersList);

  return (
    <AutumnProvider
      customerData={
        session.data ? { name: session.data.user.name, email: session.data.user.email } : undefined
      }
      customerId={session.data?.user.id}
    >
      {children}
    </AutumnProvider>
  );
}

async function MessagesProvider({ children }: PropsWithChildren) {
  const messages = await getMessages();

  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}

export async function ServerProviders({ children }: PropsWithChildren) {
  return (
    <Suspense fallback={null}>
      <SessionProvider>
        <Suspense fallback={null}>
          <MessagesProvider>
            <QueryProvider>{children}</QueryProvider>
          </MessagesProvider>
        </Suspense>
      </SessionProvider>
    </Suspense>
  );
}
