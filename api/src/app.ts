import cookie from '@fastify/cookie';
import Fastify from 'fastify';

import { authRoutes } from './auth/routes.js';
import { membersRoutes } from './members/routes.js';
import type { Env } from './config.js';
import type { Db } from './db/index.js';

// App factory instead of a singleton: tests (and later a worker) can build
// isolated instances and use Fastify's inject() without binding a port.
// The db is injected, not created here — the caller owns its lifecycle.
export async function buildApp(env: Env, db: Db) {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
  });

  await app.register(cookie);
  await app.register(authRoutes, { db });
  await app.register(membersRoutes, { db });

  app.get('/healthz', async () => ({ status: 'ok' }));

  return app;
}
