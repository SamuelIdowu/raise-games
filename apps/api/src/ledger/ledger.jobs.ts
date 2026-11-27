import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env.instance';
import { LedgerService } from './ledger.service';

export const LEDGER_QUEUE = 'ledger-checks';

/**
 * Nightly ledger invariant check (TA: "A nightly check confirms all ledger accounts net to
 * zero"; alert contract for M4: a `ledger.imbalance` error log line). The job scheduler is
 * keyed, so several API instances still produce one run. LEDGER_JOBS_DISABLED=true skips
 * it (tests call `LedgerService.checkInvariants` directly).
 */
@Injectable()
export class LedgerJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LedgerJobs.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: Redis | null = null;

  constructor(private readonly ledger: LedgerService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.LEDGER_JOBS_DISABLED === 'true') return;
    try {
      this.connection = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        connectTimeout: 2000,
      });
      await this.connection.connect();
      this.queue = new Queue(LEDGER_QUEUE, { connection: this.connection });
      await this.queue.upsertJobScheduler('net-zero', { pattern: '0 2 * * *', tz: 'Africa/Lagos' });
      this.worker = new Worker(
        LEDGER_QUEUE,
        async (job) => (job.name === 'net-zero' ? this.ledger.checkInvariants() : null),
        { connection: this.connection, concurrency: 1 },
      );
      this.worker.on('failed', (job, err) =>
        this.logger.error(`ledger job ${job?.name} failed: ${err.message}`),
      );
    } catch (error) {
      this.logger.error(
        `Ledger check scheduler unavailable (${(error as Error).message}); nightly check skipped`,
      );
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
