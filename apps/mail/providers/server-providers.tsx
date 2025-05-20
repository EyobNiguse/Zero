import type { IntlMessages, Locale } from '@/i18n/config';
import type { Session } from '@/lib/auth-client';
import { QueryProvider } from './query-provider';
import { AutumnProvider } from 'autumn-js/react';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

export function ServerProviders({
  children,
  messages,
  locale,
}: PropsWithChildren<{ messages: IntlMessages; locale: Locale }>) {
  return (
    <AutumnProvider backendUrl={import.meta.env.VITE_PUBLIC_BACKEND_URL}>
      <IntlProvider messages={messages} locale={locale} timeZone={'UTC'}>
        <QueryProvider>{children}</QueryProvider>
      </IntlProvider>
    </AutumnProvider>
  );
}
