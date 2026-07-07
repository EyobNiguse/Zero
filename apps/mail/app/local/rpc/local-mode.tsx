import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/providers/query-provider';
import { createTokenProvider, type ProviderId } from '../auth';
import { isLocalActive } from './bridge';
import { activateLocal } from './activate';

// Matches the resolver's SYNC_TTL: re-invalidate the thread list on this cadence.
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

/** Re-activates local mode on every load so the session survives a refresh. */
export function LocalMode() {
  const qc = useQueryClient();
  const trpc = useTRPC();

  // Idle auto-refresh: invalidate the thread list while local-active and visible.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isLocalActive() || document.hidden) return;
      qc.invalidateQueries({ queryKey: trpc.mail.listThreads.infiniteQueryKey() });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [qc, trpc]);

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
