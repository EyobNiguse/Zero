'use client';

import { keyboardShortcuts } from '@/config/shortcuts';
import { useShortcuts } from './use-hotkey-utils';

const reply = () => console.log('Reply');
const replyAll = () => console.log('Reply All');
const forward = () => console.log('Forward');
const printEmail = () => console.log('Print Email');
const viewDetails = () => console.log('View Email Details');
const closeView = (event: KeyboardEvent) => {
  console.log('Close Thread View');
  event.preventDefault();
};

export function ThreadDisplayHotkeys() {
  const scope = 'thread-display';

  const handlers = {
    reply,
    replyAll,
    forward,
    printEmail,
    viewEmailDetails: viewDetails,
    closeView: () => closeView(new KeyboardEvent('keydown', { key: 'Escape' })),
  };

  const threadDisplayShortcuts = keyboardShortcuts.filter(
    shortcut => shortcut.scope === scope
  );

  useShortcuts(threadDisplayShortcuts, handlers, { scope });

  return null;
} 