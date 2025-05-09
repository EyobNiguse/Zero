import { useMemo } from 'react';

type Feature = {
  feature_id: string;
  included_usage: number;
  balance: number;
  unlimited: boolean;
};

type FeatureState = {
  total: number;
  remaining: number;
  unlimited: boolean;
  enabled: boolean;
};

type Features = {
  chatMessages: FeatureState;
  connections: FeatureState;
  brainActivity: FeatureState;
};

const DEFAULT_FEATURES: Features = {
  chatMessages: { total: 0, remaining: 0, unlimited: false, enabled: false },
  connections: { total: 0, remaining: 0, unlimited: false, enabled: false },
  brainActivity: { total: 0, remaining: 0, unlimited: false, enabled: false },
};

const FEATURE_IDS = {
  CHAT: 'chat-messages',
  CONNECTIONS: 'connections',
  BRAIN: 'brain-activity',
} as const;

export const useBilling = () => {
  const customerFeatures = useMemo(() => {
    return {
      chatMessages: {
        total: 100,
        remaining: 75,
        unlimited: false,
        enabled: true,
      },
      connections: {
        total: 5,
        remaining: 3,
        unlimited: false,
        enabled: true,
      },
      brainActivity: {
        total: 1000,
        remaining: 850,
        unlimited: false,
        enabled: true,
      },
    };
  }, []);

  return {
    refetch: () => {},
    attach: () => {},
    track: () => {},
    ...customerFeatures,
  };
};
