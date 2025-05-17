import { env as runtimeEnv } from 'next-runtime-env';
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

const getEnv = (variable: string) => runtimeEnv(variable) ?? process.env[variable];

export const env = createEnv({
  skipValidation: true,

  server: {
    DATABASE_URL: z.string().url(),
    NEXT_RUNTIME: z.string().optional(),
    NODE_ENV: z.string().optional(),
    DOCKER_BUILD: z.coerce.boolean().optional(),
    CI: z.coerce.boolean().optional(),
    GROQ_API_KEY: z.string().optional(),
    AI_SYSTEM_PROMPT: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    REDIS_URL: z.string().url(),
    REDIS_TOKEN: z.string(),
  },

  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_BACKEND_URL: z.string().url(),
    NEXT_PUBLIC_ELEVENLABS_AGENT_ID: z.string(),
    NEXT_PUBLIC_IMAGE_PROXY: z.string().url().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
    NEXT_PUBLIC_IMAGE_API_URL: z.string().optional(),
  },

  experimental__runtimeEnv: {
    NEXT_PUBLIC_BACKEND_URL: getEnv('NEXT_PUBLIC_BACKEND_URL') ?? 'http://REPLACE-BACKEND-URL.com',
    NEXT_PUBLIC_APP_URL: getEnv('NEXT_PUBLIC_APP_URL') ?? 'http://REPLACE-APP-URL.com',
    NEXT_PUBLIC_ELEVENLABS_AGENT_ID: getEnv('NEXT_PUBLIC_ELEVENLABS_AGENT_ID'),
    NEXT_PUBLIC_IMAGE_PROXY: getEnv('NEXT_PUBLIC_IMAGE_PROXY'),
    NEXT_PUBLIC_POSTHOG_KEY: getEnv('NEXT_PUBLIC_POSTHOG_KEY'),
    NEXT_PUBLIC_POSTHOG_HOST: getEnv('NEXT_PUBLIC_POSTHOG_HOST'),
    NEXT_PUBLIC_IMAGE_API_URL: getEnv('NEXT_PUBLIC_IMAGE_API_URL'),
  },
});
