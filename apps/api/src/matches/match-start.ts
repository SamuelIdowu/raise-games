import { and, eq, lte, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from '../db/client';

/**
 * Accepted → In progress at the agreed start (Sprint 6, F6.5).
 *
 * Decision `[confirm]`: every Stage 1 game starts on the clock. The agreed start is
 * copied onto the match row (`scheduled_start_at`) at acceptance, and this sweep compares
 * row timestamps (TA: "deadlines stored as row values, not cron-computed"). Games that
 * use a custom room (`roomCode` in games.json) still start on the clock; the room code
 * is shared in the match room before then.
 *
 * Idempotent and race-safe: the UPDATE only matches rows still in `accepted`, and the
 * outbox event is written in the same transaction.
 */
export async function startDueMatches(now: Date = new Date()): Promise<string[]> {
  return db.transaction(async (tx) => {
    const started = await tx
      .update(schema.matches)
      .set({
        status: 'in_progress',
        inProgressAt: now,
        version: sql`${schema.matches.version} + 1`,
        updatedAt: now,
      })
      .where(and(eq(schema.matches.status, 'accepted'), lte(schema.matches.scheduledStartAt, now)))
      .returning({ id: schema.matches.id });

    if (started.length > 0) {
      await tx.insert(schema.outboxEvents).values(
        started.map(({ id }) => ({
          id: uuidv7(),
          type: 'match.started',
          subjectId: id,
          payload: { matchId: id },
        })),
      );
    }
    return started.map(({ id }) => id);
  });
}
