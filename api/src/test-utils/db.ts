import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { buildDb } from '../db/index.js';

// Shared plumbing for integration tests. Tests self-migrate: drizzle-kit
// style migrations are idempotent — already-applied ones are skipped.
// Tests use unique emails per run instead of wiping tables, so they can
// never destroy real data in a shared dev database.
export async function buildTestDb(url: string) {
  const { db, pool, close } = buildDb(url);

  await migrate(db, { migrationsFolder: './src/db/migrations' });

  return { db, pool, close };
}
