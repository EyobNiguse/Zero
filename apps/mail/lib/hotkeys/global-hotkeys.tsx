'use client';

import { useRouter } from 'next/navigation';
import { keyboardShortcuts } from '@/config/shortcuts';
import { useShortcuts } from './use-hotkey-utils';

export function GlobalHotkeys() {
  const router = useRouter();
  const scope = 'global';

  const handlers = {
    newEmail: () => console.log('Start New Email'),
    search: () => console.log('Focus Search Input'),
    undoLastAction: () => console.log('Undo Last Action'),
    helpWithShortcuts: () => console.log('Show Help Dialog'),
    goToDrafts: () => router.push('/mail/draft'),
    inbox: () => router.push('/mail/inbox'),
    sentMail: () => router.push('/mail/sent'),
  };

  const globalShortcuts = keyboardShortcuts.filter(
    shortcut => shortcut.scope === scope
  );

  useShortcuts(globalShortcuts, handlers, { scope });

  return null;
} 