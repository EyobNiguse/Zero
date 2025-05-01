'use client';

import { keyboardShortcuts } from '@/config/shortcuts';
import useMoveTo from '@/hooks/driver/use-move-to';
import useDelete from '@/hooks/driver/use-delete';
import { useShortcuts } from './use-hotkey-utils';
import { useThread } from '@/hooks/use-threads';
import { useParams } from 'next/navigation';
import { useQueryState } from 'nuqs';

const closeView = (event: KeyboardEvent) => {
  event.preventDefault();
};

export function ThreadDisplayHotkeys() {
  const scope = 'thread-display';
  const [mode, setMode] = useQueryState('mode');
  const [activeReplyId, setActiveReplyId] = useQueryState('activeReplyId');
  const [openThreadId] = useQueryState('threadId');
  const { data: thread } = useThread(openThreadId);
  const params = useParams<{
    folder: string;
  }>();
  const { mutate: deleteThread } = useDelete();
  const { mutate: moveTo } = useMoveTo();

  const handlers = {
    closeView: () => closeView(new KeyboardEvent('keydown', { key: 'Escape' })),
    reply: () => {
      setMode('reply');
      setActiveReplyId(thread?.latest?.id ?? '');
    },
    forward: () => {
      setMode('forward');
      setActiveReplyId(thread?.latest?.id ?? '');
    },
    replyAll: () => {
      setMode('replyAll');
      setActiveReplyId(thread?.latest?.id ?? '');
    },
    delete: () => {
      if (!openThreadId) return;
      if (params.folder === 'bin') {
        deleteThread(thread?.latest?.id ?? openThreadId);
      } else {
        moveTo({
          threadIds: [thread?.latest?.id ?? openThreadId],
          currentFolder: params.folder,
          destination: 'bin',
        });
      }
    },
  };

  const threadDisplayShortcuts = keyboardShortcuts.filter((shortcut) => shortcut.scope === scope);

  useShortcuts(threadDisplayShortcuts, handlers, { scope });

  return null;
}
