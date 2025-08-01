import { env } from 'cloudflare:workers';

export { env };
export type Env = typeof env;
