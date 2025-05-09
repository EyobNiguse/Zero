'use client';

import { TriangleAlert } from 'lucide-react';
import { useQueryState } from 'nuqs';
import { useEffect } from 'react';
import { toast } from 'sonner';

const errorMessages: Record<string, string> = {
  require_scopes_missing:
    'We’re missing the permissions needed to craft your full experience. Please sign in again and allow the requested access.',
};

const errorToasts: Record<string, string> = {
  early_access_required: 'Early access is required to log in',
  unauthorized: 'Zero could not load your data from the 3rd party provider. Please try again.',
};

const ErrorMessage = () => {
  const [error] = useQueryState('error');

  useEffect(() => {
    if (error && error in errorToasts) {
      toast.error(errorToasts[error]);
    }
  });

  if (!error || !(error in errorMessages)) return null;

  return (
    <div className="border-red/10 bg-red/5 min-w-0 max-w-fit shrink overflow-hidden break-words rounded-lg border p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center">
        <TriangleAlert size={28} />
        <p className="ml-2 text-sm text-black/80 dark:text-white/80">{errorMessages[error]}</p>
      </div>
    </div>
  );
};

export default ErrorMessage;
