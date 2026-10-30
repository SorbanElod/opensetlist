import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { loadEnv } from './config.js';
import { buildTestDb } from './test-utils/db.js';

// /healthz needs no DB logic, but buildApp now takes one (auth routes are
// registered inside). Same DATABASE_URL pattern as the route tests.
const dbUrl = process.env.DATABASE_URL;

describe.skipIf(!dbUrl)('GET /healthz', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const testDb = await buildTestDb(dbUrl!);
    close = testDb.close;

    app = await buildApp(
      loadEnv({
        DATABASE_URL: dbUrl!,
        NODE_ENV: 'development',
        LOG_LEVEL: 'fatal',
      }),
      testDb.db,
    );
  });

  afterAll(async () => {
    await app.close();
    await close();
  });

  it('returns ok without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
