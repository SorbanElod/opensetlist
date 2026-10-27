import { describe, expect, it } from 'vitest';

import { loadEnv } from './config.js';
import { buildApp } from './app.js';

// inject() exercises the full request path in-process — no port, no network.
describe('GET /healthz', () => {
  it('returns ok', async () => {
    // 'fatal' is the quietest level the config schema allows.
    const app = await buildApp(
      loadEnv({
        LOG_LEVEL: 'fatal',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/test',
      }),
    );

    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });

    await app.close();
  });
});
