'use client';

import { HotkeyProviderWrapper } from '@/components/providers/hotkey-provider-wrapper';
import { CommandPaletteProvider } from '@/components/context/command-palette-context';
import { dexieStorageProvider } from '@/lib/idb';
import { SWRConfig } from 'swr';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <HotkeyProviderWrapper>
      <CommandPaletteProvider>
        <div className="relative flex overflow-hidden max-h-screen w-full">
          <SWRConfig
            value={{
              provider: typeof window !== 'undefined' ? dexieStorageProvider : undefined,
              revalidateOnFocus: false,
              revalidateIfStale: false,
              shouldRetryOnError: false,
            }}
          >
            {children}
          </SWRConfig>
        </div>
      </CommandPaletteProvider>
    </HotkeyProviderWrapper>
  );
}
