import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { redisForBullMQ } from '../cache/redis';

export const challengeExpiryQueueName = 'challenge-expiry';
export const challengeExpiryQueue = new Queue(challengeExpiryQueueName, {
  connection: redisForBullMQ,
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});

export interface ChallengeExpiryJobData {
  challengeId: string;
}

const logger = new Logger('ChallengeExpiryQueue');

const jobIdFor = (challengeId: string) => `challenge-expiry:${challengeId}`;

/**
 * Best-effort: schedules a delayed job that expires the challenge at its deadline.
 * Never throws. The database write that this follows is already committed, and the
 * DB sweeper in ChallengeExpiryWorker expires anything a missing job would have missed.
 */
export async function scheduleChallengeExpiry(challengeId: string, deadline: Date): Promise<void> {
  const delay = Math.max(0, deadline.getTime() - Date.now());
  try {
    await challengeExpiryQueue.add(
      'expire-challenge',
      { challengeId } satisfies ChallengeExpiryJobData,
      { delay, jobId: jobIdFor(challengeId) },
    );
  } catch (err) {
    logger.warn(
      `Could not schedule expiry for challenge ${challengeId}; sweeper will handle it: ${String(err)}`,
    );
  }
}

/** Best-effort removal of a pending expiry job. A leftover job is harmless (the worker re-checks status). */
export async function cancelChallengeExpiry(challengeId: string): Promise<void> {
  try {
    await challengeExpiryQueue.remove(jobIdFor(challengeId));
  } catch (err) {
    logger.warn(`Could not remove expiry job for challenge ${challengeId}: ${String(err)}`);
  }
}
