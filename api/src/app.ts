import cookie from '@fastify/cookie';
import Fastify from 'fastify';

import { arrangementsRoutes } from './arrangements/routes.js';
import { authRoutes } from './auth/routes.js';
import { membersRoutes } from './members/routes.js';
import { setlistsRoutes } from './setlists/routes.js';
import { songsRoutes } from './songs/routes.js';
import { tagsRoutes } from './tags/routes.js';
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
  await app.register(songsRoutes, { db });
  await app.register(arrangementsRoutes, { db });
  await app.register(setlistsRoutes, { db });
  await app.register(tagsRoutes, { db });

  // Liveness probe: no auth, no DB call. Must live under /api — in prod
  // traefik only routes PathPrefix(`/api`) to this container, and the
  // deploy pipeline curls https://<host>/api/health as its go/no-go.
  app.get('/api/health', async () => ({ status: 'ok' }));

  return app;
}
