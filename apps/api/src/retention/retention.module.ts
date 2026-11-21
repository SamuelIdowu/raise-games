import { Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env.instance';
import { StorageModule } from '../storage/storage.module';
import { RetentionService, type RetentionPolicy } from './retention.service';

export const RETENTION_QUEUE = 'retention';

export function retentionPolicyFromEnv(): RetentionPolicy {
  return {
    screenshotDays: env.SCREENSHOT_RETENTION_DAYS ?? null,
    chatDays: env.CHAT_RETENTION_DAYS ?? null,
  };
}

/**
 * Daily retention purge (audit B28) at 03:00 Lagos. Does nothing until at least one period
 * is set, and RETENTION_JOBS_DISABLED=true skips it. The keyed scheduler gives one run
 * across several API instances; the purge itself is idempotent.
 */
@Injectable()
export class RetentionJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionJobs.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: Redis | null = null;

  constructor(private readonly retention: RetentionService) {}

  async onModuleInit(): Promise<void> {
    const policy = retentionPolicyFromEnv();
    if (process.env.RETENTION_JOBS_DISABLED === 'true') return;
    if (!policy.screenshotDays && !policy.chatDays) return;
    try {
      this.connection = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        connectTimeout: 2000,
      });
      await this.connection.connect();
      this.queue = new Queue(RETENTION_QUEUE, { connection: this.connection });
      await this.queue.upsertJobScheduler('purge', { pattern: '0 3 * * *', tz: 'Africa/Lagos' });
      this.worker = new Worker(
        RETENTION_QUEUE,
        async (job) => (job.name === 'purge' ? this.retention.purge(policy) : null),
        { connection: this.connection, concurrency: 1 },
      );
      this.worker.on('failed', (job, err) =>
        this.logger.error(`retention job ${job?.name} failed: ${err.message}`),
      );
    } catch (error) {
      this.logger.error(`Retention scheduler unavailable (${(error as Error).message})`);
      await this.onModuleDestroy();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    this.connection?.disconnect();
    this.worker = null;
    this.queue = null;
    this.connection = null;
  }
}

@Module({
  imports: [StorageModule],
  providers: [RetentionService, RetentionJobs],
  exports: [RetentionService],
})
export class RetentionModule {}
