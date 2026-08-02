import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTRPC } from '@/providers/query-provider';
import { createTokenProvider, type ProviderId } from '../auth';
import { isMirrorPersistent } from '../db/client';
import { isLocalActive } from './bridge';
import { onMirrorChanged } from './dedupe';
import { activateLocal } from './activate';
import { pollChanges } from './local-utils';
import { flushOutbox } from './outbox';

const POLL_INTERVAL_MS = 2 * 60 * 1000;
/** Queued mail should not wait on the delta poll — a send is due within its undo window. */
const OUTBOX_INTERVAL_MS = 15 * 1000;

/** Re-activates local mode on every load so the session survives a refresh. */
export function LocalMode() {
  const qc = useQueryClient();
  const trpc = useTRPC();

  // Reads serve SQLite and refresh behind the response — this is how that refresh reaches the UI.
  useEffect(
    () =>
      onMirrorChanged(() => {
        qc.invalidateQueries({ queryKey: trpc.mail.listThreads.infiniteQueryKey() });
        qc.invalidateQueries({ queryKey: trpc.mail.get.queryKey() });
        qc.invalidateQueries({ queryKey: trpc.mail.getMessageAttachments.queryKey() });
        qc.invalidateQueries({ queryKey: trpc.drafts.get.queryKey() });
        qc.invalidateQueries({ queryKey: trpc.drafts.list.queryKey() });
      }),
    [qc, trpc],
  );

  // Delta poll: pulls only what changed into SQLite. emitMirrorChanged drives the UI re-read.
  useEffect(() => {
    const tick = () => {
      if (!isLocalActive() || document.hidden) return;
      void pollChanges();
    };
    tick();
    const timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  // Without a SharedWorker only one tab can hold the OPFS file, and the others run in memory. Reads
  // still work, but a draft or queued send written here dies with the tab — so say so rather than
  // let it look normal.
  useEffect(() => {
    void isMirrorPersistent().then((ok) => {
      if (ok) return;
      toast.warning('Mail is open in another tab', {
        description: 'Drafts and queued sends written in this tab will not be saved. Use the other tab.',
        duration: Infinity,
      });
    });
  }, []);

  // Drain the outbox: queued sends, draft pushes, draft deletes. Runs while hidden — a send the user
  // fired before switching tabs still has to go out — and again the moment the network returns.
  useEffect(() => {
    const flush = () => {
      if (!isLocalActive()) return;
      void flushOutbox();
    };
    flush();
    const timer = setInterval(flush, OUTBOX_INTERVAL_MS);
    window.addEventListener('online', flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', flush);
    };
  }, []);

  useEffect(() => {
    if (isLocalActive()) return;
    const last = localStorage.getItem('local.provider');
    if (last !== 'google' && last !== 'microsoft') return;
    // Guard the async work: bail if the effect is torn down before restore resolves.
    let cancelled = false;
    (async () => {
      const p = createTokenProvider(last as ProviderId);
      const ok = await p.restoreSession().catch(() => false);
      if (cancelled) return;
      if (ok) {
        await activateLocal(p);
        if (cancelled) return;
        await qc.invalidateQueries();
        await qc.refetchQueries({ queryKey: trpc.mail.listThreads.infiniteQueryKey() });
      } else {
        // Restore failed — clear the flags and bounce off any protected route.
        localStorage.removeItem('local.provider');
        localStorage.removeItem('local.email');
        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/mail')) {
          window.location.href = '/login';
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qc]);

  return null;
}
