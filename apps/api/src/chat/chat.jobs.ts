import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env.instance';
import { ChatService } from './chat.service';

export const CHAT_MAINTENANCE_QUEUE = 'chat-maintenance';

/**
 * Repeating chat maintenance on BullMQ (TA "Background jobs"). Job schedulers are keyed,
 * so running several API instances still yields one schedule, and both jobs are
 * idempotent:
 *  - ensure-partitions (daily): keeps two months of `messages` partitions ahead.
 *  - sweep-locks (every 5 min): stamps 72h locks and posts the "Chat is closed" message.
 *
 * Connections are created on init, not in the constructor, so importing the module
 * (tests, scripts) does not open Redis sockets. CHAT_JOBS_DISABLED=true skips it.
 */
@Injectable()
export class ChatJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatJobs.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private connection: Redis | null = null;

  constructor(private readonly chat: ChatService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.CHAT_JOBS_DISABLED === 'true') return;

    // Partitions must exist before the first insert of a new month even if Redis is
    // down, so make sure of them once at boot regardless of the scheduler.
    await this.chat.ensurePartitions().catch((error: Error) => {
      this.logger.error(`ensure_message_partitions failed at boot: ${error.message}`);
    });

    try {
      this.connection = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        connectTimeout: 2000,
      });
      await this.connection.connect();
      this.queue = new Queue(CHAT_MAINTENANCE_QUEUE, { connection: this.connection });
      await this.queue.upsertJobScheduler('ensure-partitions', { every: 24 * 3600_000 });
      await this.queue.upsertJobScheduler('sweep-locks', { every: 5 * 60_000 });
      this.worker = new Worker(
        CHAT_MAINTENANCE_QUEUE,
        async (job) => {
          if (job.name === 'ensure-partitions') return this.chat.ensurePartitions();
          if (job.name === 'sweep-locks') return this.chat.sweepLocks();
          return null;
        },
        { connection: this.connection, concurrency: 1 },
      );
      this.worker.on('failed', (job, err) =>
        this.logger.error(`chat job ${job?.name} failed: ${err.message}`),
      );
    } catch (error) {
      this.logger.error(
        `Chat maintenance scheduler unavailable (${(error as Error).message}); ` +
          'locks are still enforced on send, partitions were ensured at boot',
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
