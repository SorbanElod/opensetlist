import { buildApp } from './app.js';
import { loadEnv } from './config.js';

const env = loadEnv();
const app = await buildApp(env);

app.listen({ port: env.PORT, host: env.HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
