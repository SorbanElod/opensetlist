import { buildApp } from './app.js';
import { loadEnv } from './config.js';
import { buildDb } from './db/index.js';
import { attachRealtime } from './realtime.js';

const env = loadEnv();
const { db } = buildDb(env.DATABASE_URL);
const app = await buildApp(env, db);

app.listen({ port: env.PORT, host: env.HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

// Live updates (issue #13) attach to the same HTTP server, after listen.
attachRealtime(app.server, db);
