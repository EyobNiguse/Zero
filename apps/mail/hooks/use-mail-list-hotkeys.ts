import { useState } from 'react';

export function useMailListHotkeys() {
  const [removingEmails, setRemovingEmails] = useState<Set<string>>(new Set());

  return [removingEmails, setRemovingEmails] as const;
} 