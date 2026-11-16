import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { redisForBullMQ } from '../cache/redis';
import { ResultsService } from './results.service';
import { matchDeadlineQueueName, type MatchDeadlineJobData } from './match-deadline.queue';

/** How often the DB sweeper re-checks confirmation deadlines (PRD: fire within 1 minute). */
const SWEEP_INTERVAL_MS = 30_000;

@Injectable()
export class MatchDeadlineWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchDeadlineWorker.name);
  private worker?: Worker<MatchDeadlineJobData>;
  private sweepTimer?: NodeJS.Timeout;
  private sweeping = false;

  constructor(private readonly matches: ResultsService) {}

  onModuleInit() {
    this.worker = new Worker<MatchDeadlineJobData>(
      matchDeadlineQueueName,
      async (job: Job<MatchDeadlineJobData>) => {
        await this.matches.resolveDueConfirmations(job.data.matchId);
      },
      { connection: redisForBullMQ, concurrency: 5 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Confirmation deadline job ${job?.id} failed: ${err.message}`, err.stack);
    });
    this.worker.on('error', (err) =>
      this.logger.warn(`Match deadline worker error: ${err.message}`),
    );

    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  async sweep(): Promise<string[]> {
    if (this.sweeping) return [];
    this.sweeping = true;
    try {
      const ids = await this.matches.resolveDueConfirmations();
      if (ids.length > 0)
        this.logger.log(`Sweeper resolved ${ids.length} confirmation deadline(s)`);
      return ids;
    } catch (err) {
      this.logger.error(`Confirmation deadline sweep failed: ${String(err)}`);
      return [];
    } finally {
      this.sweeping = false;
    }
  }

  async onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    await this.worker?.close();
  }
}
