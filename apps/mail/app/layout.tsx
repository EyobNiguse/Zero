import { CircleX, AlertCircle, AlertOctagon } from 'lucide-react';
import { CookieProvider } from '@/providers/cookie-provider';
import { getLocale, getMessages } from 'next-intl/server';
import { CircleCheck } from '@/components/icons/icons';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { NextIntlClientProvider } from 'next-intl';
import { siteConfig } from '@/lib/site-config';
import { Providers } from '@/lib/providers';
import { headers } from 'next/headers';
import type { Viewport } from 'next';
import { cn } from '@/lib/utils';
import { Toaster } from 'sonner';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata = siteConfig;

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default async function RootLayout({
  children,
  cookies,
}: Readonly<{
  children: React.ReactNode;
  cookies: React.ReactNode;
}>) {
  // const isEuRegion = (await headers()).get('x-user-eu-region') === 'true';
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* <script src="https://unpkg.com/react-scan/dist/auto.global.js" /> */}
        <meta name="x-user-country" content={(await headers()).get('x-user-country') || ''} />
        <meta
          name="x-user-eu-region"
          content={(await headers()).get('x-user-eu-region') || 'false'}
        />
      </head>
      <body
        className={cn(geistSans.variable, geistMono.variable, 'antialiased')}
        suppressHydrationWarning
      >
        <Providers attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <NextIntlClientProvider messages={messages}>
            {children}
            {cookies}
            <Toaster
              position="bottom-center"
              icons={{
                success: <CircleCheck className="h-4.5 w-4.5 border-none fill-[#36B981]" />,
                error: <CircleX className="h-4.5 w-4.5 fill-[#FF0000]" />,
                warning: <AlertCircle className="h-4.5 w-4.5 fill-[#FFC107]" />,
                info: <AlertOctagon className="h-4.5 w-4.5 fill-[#5767fb]" />,
              }}
              toastOptions={{
                classNames: {
                  title:
                    'title flex-1 justify-center text-black dark:text-white text-sm leading-none',
                  description: 'description',
                  actionButton: 'action-button',
                  cancelButton: 'cancel-button',
                  closeButton: 'close-button',
                  loading: 'px-3',
                  loader: 'px-3',
                  icon: 'px-4',
                  content: 'px py-3',
                  default:
                    'w-96 px-1.5 py-1.5 bg-white dark:bg-[#2C2C2C] rounded-xl inline-flex items-center gap-2 overflow-visible border dark:border-none',
                },
              }}
              // remove these
              expand
              duration={1000000000}
              visibleToasts={10}
            />
            <Analytics />
            {/* {isEuRegion && <CookieConsent />} */}
          </NextIntlClientProvider>
        </Providers>
      </body>
    </html>
  );
}
