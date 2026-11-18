import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env.instance';
import { OpsService } from './ops.service';

export const OPS_QUEUE = 'ops-checks';

/**
 * Runs the alert check every 5 minutes (F15.5). The keyed job scheduler gives one run per
 * interval across instances. OPS_JOBS_DISABLED=true skips it (tests call the service).
 */
@Injectable()
export class OpsJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpsJobs.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: Redis | null = null;

  constructor(private readonly ops: OpsService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.OPS_JOBS_DISABLED === 'true') return;
    try {
      this.connection = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        connectTimeout: 2000,
      });
      await this.connection.connect();
      this.queue = new Queue(OPS_QUEUE, { connection: this.connection });
      await this.queue.upsertJobScheduler('alert-check', { every: 5 * 60_000 });
      this.worker = new Worker(
        OPS_QUEUE,
        async (job) => (job.name === 'alert-check' ? this.ops.check() : null),
        { connection: this.connection, concurrency: 1 },
      );
      this.worker.on('failed', (job, err) =>
        this.logger.error(`ops job ${job?.name} failed: ${err.message}`),
      );
    } catch (error) {
      // Redis down is itself an incident; say so loudly rather than silently skip alerts.
      this.logger.error({
        event: 'alert',
        status: 'firing',
        rule: 'ops_scheduler_unavailable',
        severity: 'sev1',
        summary: `Alert scheduler unavailable: ${(error as Error).message}`,
      });
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
