import { parseEnvironment } from '@etsy-saas/shared';
import { buildApp } from './app.js';
import { Database } from './database.js';
import { DevelopmentEmailProvider } from './email.js';
import { JobQueue } from './jobs.js';
import { ObjectStorage } from './storage.js';
const env = parseEnvironment(process.env);
const database = new Database(env.DATABASE_URL);
const jobs = new JobQueue(env.REDIS_URL);
const storage = new ObjectStorage(env);
const email = new DevelopmentEmailProvider();
const app = await buildApp({
  env,
  auth: database,
  email,
  readiness: {
    database: () => database.healthCheck(),
    redis: jobs.healthCheck,
    storage: storage.healthCheck,
  },
});
const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await Promise.all([database.close(), jobs.close()]);
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
await app.listen({ host: '0.0.0.0', port: env.API_PORT });
