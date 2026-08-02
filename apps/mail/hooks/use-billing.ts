// No billing in browser-first mode: there is no backend to meter against, so every feature is on.
// Same shape as the autumn-backed hook it replaces, so callers are unchanged.
import type { Customer } from 'autumn-js';

type FeatureState = {
  total: number;
  remaining: number;
  unlimited: boolean;
  enabled: boolean;
  usage: number;
  nextResetAt: number | null;
  interval: string;
  included_usage: number;
};

const UNLIMITED: FeatureState = {
  total: Infinity,
  remaining: Infinity,
  unlimited: true,
  enabled: true,
  usage: 0,
  nextResetAt: null,
  interval: '',
  included_usage: Infinity,
};

const noop = async (..._args: unknown[]) => {};

export const useBilling = () => ({
  isLoading: false,
  customer: null as Customer | null,
  refetch: noop,
  attach: noop,
  track: noop,
  openBillingPortal: noop,
  isPro: true,
  chatMessages: UNLIMITED,
  connections: UNLIMITED,
  brainActivity: UNLIMITED,
});
