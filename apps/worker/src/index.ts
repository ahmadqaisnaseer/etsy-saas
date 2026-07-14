import { parseEnvironment } from '@etsy-saas/shared';
import { Worker } from 'bullmq';
import pino from 'pino';

const env = parseEnvironment(process.env);
const logger = pino({ level: env.LOG_LEVEL, redact: ['password', 'token', 'credentials'] });

// This first queue proves the retry, observability, and graceful-shutdown path.
// It deliberately performs no Etsy network calls.
const worker = new Worker<{ tenantId: string; requestedBy: string }>(
  'maintenance',
  (job) => {
    logger.info({ jobId: job.id, tenantId: job.data.tenantId }, 'maintenance job completed');
    return Promise.resolve();
  },
  { connection: { url: env.REDIS_URL }, concurrency: 5 },
);

worker.on('failed', (job, error) => logger.error({ jobId: job?.id, error }, 'job failed'));
worker.on('error', (error) => logger.error({ error }, 'worker error'));

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'worker shutting down');
  await worker.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

logger.info('worker ready');
