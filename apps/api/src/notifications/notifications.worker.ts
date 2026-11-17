import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { v7 as uuidv7 } from 'uuid';
import { env } from '../config/env.instance';
import { db, schema } from '../db/client';
import { NotificationsService, type Channel, type Scheduler } from './notifications.service';

export const NOTIFICATIONS_QUEUE = 'notifications';
const ATTEMPTS = 5;

interface DeliverJob {
  notificationId: string;
  channel: Channel;
}

/** Idempotent job id per (notification, channel). No ':' (BullMQ reserves it). */
export function deliverJobId(notificationId: string, channel: Channel): string {
  return `deliver-${notificationId}-${channel}`;
}

/**
 * Outbound delivery on BullMQ (F11.1): `attempts` + exponential backoff (30s, 1m, 2m, …),
 * delayed jobs for quiet hours, and a 5-minute scheduler for "challenge expiring".
 * Job ids make a re-queued delivery idempotent. NOTIFICATIONS_JOBS_DISABLED=true skips it
 * (tests drive the service directly); without Redis, deliveries run inline instead.
 */
@Injectable()
export class NotificationsWorker implements OnModuleInit, OnModuleDestroy, Scheduler {
  private readonly logger = new Logger(NotificationsWorker.name);
  private connection: Redis | null = null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(private readonly notifications: NotificationsService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NOTIFICATIONS_JOBS_DISABLED === 'true') return;
    try {
      this.connection = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        connectTimeout: 2000,
      });
      await this.connection.connect();
      this.queue = new Queue(NOTIFICATIONS_QUEUE, { connection: this.connection });
      await this.queue.upsertJobScheduler('challenge-expiring', { every: 5 * 60_000 });
      this.worker = new Worker(
        NOTIFICATIONS_QUEUE,
        async (job) => {
          if (job.name === 'challenge-expiring') return this.notifications.notifyExpiring();
          const data = job.data as DeliverJob;
          return this.notifications.deliver(
            data.notificationId,
            data.channel,
            job.attemptsMade + 1,
          );
        },
        { connection: this.connection, concurrency: 10 },
      );
      this.worker.on('failed', (job, err) => {
        if (!job || job.name === 'challenge-expiring') return;
        if (job.attemptsMade >= ATTEMPTS) {
          const data = job.data as DeliverJob;
          this.logger.error(
            `notification ${data.notificationId} ${data.channel} gave up: ${err.message}`,
          );
          void db.insert(schema.deliveryAttempts).values({
            id: uuidv7(),
            notificationId: data.notificationId,
            channel: data.channel,
            status: 'failed',
            attempt: job.attemptsMade,
            detail: `gave up after ${job.attemptsMade} attempts: ${err.message}`.slice(0, 300),
          });
        }
      });
      this.notifications.useScheduler(this);
    } catch (error) {
      this.logger.error(
        `Notifications queue unavailable (${(error as Error).message}); delivering inline`,
      );
      await this.onModuleDestroy();
    }
  }

  async schedule(notificationId: string, channel: Channel, delayMs: number): Promise<boolean> {
    if (!this.queue) return false;
    try {
      await this.queue.add('deliver', { notificationId, channel } satisfies DeliverJob, {
        // BullMQ rejects custom ids containing ':' ("Custom Id cannot contain :").
        jobId: deliverJobId(notificationId, channel),
        delay: Math.max(0, delayMs),
        attempts: ATTEMPTS,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.notifications.useScheduler(null);
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    this.connection?.disconnect();
    this.worker = null;
    this.queue = null;
    this.connection = null;
  }
}
