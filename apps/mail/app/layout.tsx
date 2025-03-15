import { CookieConsent } from "@/components/cookies/cookie-dialog";
import { CookieProvider } from "@/providers/cookie-provider";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { siteConfig } from "@/lib/site-config";
import { Toast } from "@/components/ui/toast";
import { Providers } from "@/lib/providers";
import { headers } from "next/headers";
import { cn } from "@/lib/utils";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = siteConfig;

export default async function RootLayout({
  children,
  cookies,
}: Readonly<{
  children: React.ReactNode;
  cookies: React.ReactNode;
}>) {
  const isEuRegion = (await headers()).get("x-user-eu-region") === "true";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="x-user-country" content={(await headers()).get("x-user-country") || ""} />
        <meta
          name="x-user-eu-region"
          content={(await headers()).get("x-user-eu-region") || "false"}
        />
      </head>
      <body className={cn(geistSans.variable, geistMono.variable, "antialiased")}>
        <Providers attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <CookieProvider>
            {children}
            {cookies}
            <Toast />
            <Analytics />
            <CookieConsent />
          </CookieProvider>
        </Providers>
      </body>
    </html>
  );
}
