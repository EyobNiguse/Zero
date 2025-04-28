'use client';

import { keyboardShortcuts } from '@/config/shortcuts';
import { useShortcuts } from './use-hotkey-utils';
import { useRouter } from 'next/navigation';

export function GlobalHotkeys() {
  const router = useRouter();
  const scope = 'global';

  const handlers = {
    goToDrafts: () => router.push('/mail/draft'),
    inbox: () => router.push('/mail/inbox'),
    sentMail: () => router.push('/mail/sent'),
    search: () => {
      // TODO: Implement search - kinda tricky :/
      console.log('search');
    },
    newEmail: () => router.push('isComposeOpen=true'),
  };

  const globalShortcuts = keyboardShortcuts.filter((shortcut) => shortcut.scope === scope);

  useShortcuts(globalShortcuts, handlers, { scope });

  return null;
}
