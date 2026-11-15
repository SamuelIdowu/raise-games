import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { redisForBullMQ } from '../cache/redis';

/**
 * Confirmation-window timers (F8.4). Same reliability pattern as challenge expiry
 * (F6.3): a delayed job per match is the fast path, and the DB sweeper in
 * MatchDeadlineWorker is the safety net, so losing Redis never loses a deadline.
 */
export const matchDeadlineQueueName = 'match-deadlines';
export const matchDeadlineQueue = new Queue(matchDeadlineQueueName, {
  connection: redisForBullMQ,
  defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 1000 },
});

export interface MatchDeadlineJobData {
  matchId: string;
}

const logger = new Logger('MatchDeadlineQueue');
const jobIdFor = (matchId: string) => `match-confirmation:${matchId}`;

/** Best-effort; never throws (the sweeper covers a missing job). */
export async function scheduleConfirmationDeadline(matchId: string, deadline: Date): Promise<void> {
  try {
    await matchDeadlineQueue.add(
      'confirmation-deadline',
      { matchId } satisfies MatchDeadlineJobData,
      { delay: Math.max(0, deadline.getTime() - Date.now()), jobId: jobIdFor(matchId) },
    );
  } catch (err) {
    logger.warn(
      `Could not schedule confirmation deadline for ${matchId}; sweeper will handle it: ${String(err)}`,
    );
  }
}

/** Best-effort; a leftover job is harmless because the worker re-checks the row. */
export async function cancelConfirmationDeadline(matchId: string): Promise<void> {
  try {
    await matchDeadlineQueue.remove(jobIdFor(matchId));
  } catch (err) {
    logger.warn(`Could not remove confirmation deadline job for ${matchId}: ${String(err)}`);
  }
}
