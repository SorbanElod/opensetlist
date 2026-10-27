import { defineConfig } from 'drizzle-kit';

import { loadEnv } from './src/config.js';

// drizzle-kit reads DATABASE_URL from the environment (it auto-loads .env
// if present). The same config drives db:generate (no DB needed) and
// db:migrate (DB required).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: loadEnv().DATABASE_URL,
  },
});
