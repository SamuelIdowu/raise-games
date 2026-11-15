import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { and, eq, lte, sql, type SQL } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { redisForBullMQ } from '../cache/redis';
import { db, schema } from '../db/client';
import { challengeExpiryQueueName, type ChallengeExpiryJobData } from './challenges.queue';
import { startDueMatches } from '../matches/match-start';

/** How often the DB sweeper looks for open challenges past their deadline. */
const SWEEP_INTERVAL_MS = 30_000;

/**
 * Expires open challenges whose acceptance deadline has passed, and emits a
 * `challenge.expired` outbox event for each one, in a single transaction.
 *
 * The UPDATE itself is the guard (status = 'open' AND deadline <= now), so a
 * challenge that was accepted, declined or cancelled in the meantime is never touched.
 */
export async function expireDueChallenges(extra?: SQL): Promise<string[]> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const expired = await tx
      .update(schema.challenges)
      .set({
        status: 'expired',
        expiredAt: now,
        updatedAt: now,
        version: sql`${schema.challenges.version} + 1`,
      })
      .where(
        and(
          eq(schema.challenges.status, 'open'),
          lte(schema.challenges.acceptanceDeadline, now),
          extra,
        ),
      )
      .returning({ id: schema.challenges.id });

    if (expired.length > 0) {
      await tx.insert(schema.outboxEvents).values(
        expired.map(({ id }) => ({
          id: uuidv7(),
          type: 'challenge.expired',
          subjectId: id,
          payload: { challengeId: id },
        })),
      );
    }
    return expired.map(({ id }) => id);
  });
}

@Injectable()
export class ChallengeExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChallengeExpiryWorker.name);
  private worker?: Worker<ChallengeExpiryJobData>;
  private sweepTimer?: NodeJS.Timeout;
  private sweeping = false;

  onModuleInit() {
    // Fast path: one delayed BullMQ job per challenge, fired at its deadline.
    this.worker = new Worker<ChallengeExpiryJobData>(
      challengeExpiryQueueName,
      async (job: Job<ChallengeExpiryJobData>) => {
        await expireDueChallenges(eq(schema.challenges.id, job.data.challengeId));
      },
      { connection: redisForBullMQ, concurrency: 5, autorun: true },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Challenge expiry job ${job?.id} failed: ${err.message}`, err.stack);
    });
    this.worker.on('error', (err) => {
      this.logger.warn(`Challenge expiry worker error: ${err.message}`);
    });

    // Safety net: DB sweeper. Doesn't depend on Redis, so expiries still land
    // within SWEEP_INTERVAL_MS if a job was never scheduled or Redis lost it.
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  /** Public for tests. */
  async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const ids = await expireDueChallenges();
      if (ids.length > 0) this.logger.log(`Sweeper expired ${ids.length} challenge(s)`);
      // Same sweep moves matches to in_progress at their agreed start (F6.5).
      const started = await startDueMatches();
      if (started.length > 0) this.logger.log(`Sweeper started ${started.length} match(es)`);
    } catch (err) {
      this.logger.error(`Challenge expiry sweep failed: ${String(err)}`);
    } finally {
      this.sweeping = false;
    }
  }

  async onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    await this.worker?.close();
  }
}
