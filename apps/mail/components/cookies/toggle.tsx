'use client';

import { useGeoLocation } from '@/hooks/use-geo-location';
import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import type { CookieCategory } from '@/lib/cookies';
import React, { startTransition } from 'react';
import { Switch } from '../ui/switch';

type Props = {
  checked: boolean;
  disabled: boolean | undefined;
  category: CookieCategory;
};

const Toggle = (props: Props) => {
  const trpc = useTRPC();
  const { mutateAsync: updateCookiePreferences } = useMutation(
    trpc.cookiePreferences.updatePreferences.mutationOptions(),
  );
  const { isEuRegion } = useGeoLocation();
  const handleCookieToggle = async (key: CookieCategory, checked: boolean) => {
    startTransition(async () => {
      await updateCookiePreferences({ category: key, enabled: checked });
    });
  };

  // If not in EU/UK region, only allow necessary cookies
  if (!isEuRegion && props.category !== 'necessary') {
    return null;
  }

  return (
    <Switch
      checked={props.category === 'necessary' ? true : props.checked}
      disabled={props.disabled || !isEuRegion}
      onCheckedChange={async (checked) => await handleCookieToggle(props.category, checked)}
    />
  );
};

export default Toggle;
