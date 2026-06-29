import { type Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  out: './src/db/migrations',
  tablesFilter: ['mail0_*'],
} satisfies Config;
