import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createTokenProvider } from '../auth';
import { isLocalActive } from './bridge';
import { activateLocal } from './activate';

/**
 * Re-activates local mode on load. Microsoft sign-in returns here after a full
 * redirect (and MSAL caches the account across refresh), so restore it and
 * refetch — the login page handles the initial Google/Microsoft connect.
 */
export function LocalMode() {
  const qc = useQueryClient();

  useEffect(() => {
    if (isLocalActive() || localStorage.getItem('local.provider') !== 'microsoft') return;
    (async () => {
      const p = createTokenProvider('microsoft');
      if (await p.restoreSession()) {
        await activateLocal(p);
        await qc.invalidateQueries();
      }
    })();
  }, [qc]);

  return null;
}
