import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/providers/query-provider';
import { createTokenProvider, type ProviderId } from '../auth';
import { isLocalActive } from './bridge';
import { onMirrorChanged } from './mirror';
import { activateLocal } from './activate';
import { pollChanges } from './resolvers';
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
        // A thread's attachments land with its bodies, and this query holds them for an hour — so a
        // row read before the sync would otherwise stay "no attachments" long after they arrived.
        qc.invalidateQueries({ queryKey: trpc.mail.getMessageAttachments.queryKey() });
        // Drafts and queued sends live in the outbox, and the flusher moves them behind the UI's back.
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
        // Re-run the thread list now the driver + token are ready (recovers a mid-activation error).
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
