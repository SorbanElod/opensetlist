import { buildApp } from './app.js';
import { loadEnv } from './config.js';
import { buildDb } from './db/index.js';

const env = loadEnv();
const { db } = buildDb(env.DATABASE_URL);
const app = await buildApp(env, db);

app.listen({ port: env.PORT, host: env.HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
