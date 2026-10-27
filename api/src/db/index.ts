import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema.js';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

// Factory (like buildApp): callers own the lifecycle, tests can build
// isolated instances, and no env is read at import time.
export function buildDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    async close() {
      await pool.end();
    },
  };
}
