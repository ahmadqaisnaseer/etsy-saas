import { Queue } from 'bullmq';

export type MaintenanceJob = { tenantId: string; requestedBy: string };

export class JobQueue {
  readonly queue: Queue<MaintenanceJob>;

  constructor(redisUrl: string) {
    this.queue = new Queue<MaintenanceJob>('maintenance', {
      connection: { url: redisUrl },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    });
  }

  healthCheck = async (): Promise<void> => {
    await this.queue.waitUntilReady();
    await this.queue.getJobCounts('waiting');
  };

  async close(): Promise<void> {
    await this.queue.close();
  }
}
