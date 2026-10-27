import Fastify from 'fastify';
import type { Env } from './config.js';

// App factory instead of a singleton: tests (and later a worker) can build
// isolated instances and use Fastify's inject() without binding a port.
export async function buildApp(env: Env) {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  return app;
}
