'use client';

import { keyboardShortcuts } from '@/config/shortcuts';
import { useShortcuts } from './use-hotkey-utils';

const sendEmail = () => console.log('Send Email');

export function ComposeHotkeys() {
  const scope = 'compose';

  const handlers = {
    sendEmail,
  };

  const composeShortcuts = keyboardShortcuts.filter(
    shortcut => shortcut.scope === scope
  );

  useShortcuts(composeShortcuts, handlers, { scope });

  return null;
} 