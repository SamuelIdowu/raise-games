import { Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, inArray, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from '../db/client';
import type { Tx } from '../db/tx';
import { disputeRuledEventSchema } from '../disputes/dispute-events';
import type { OutboxEvent } from '../realtime/outbox-relay';
import {
  REPEAT_WINDOW_MS,
  START_RATING,
  isProvisional,
  rateMatch,
  replay,
  type LoggedEvent,
  type ReplayMismatch,
} from './elo';

/** Outbox event types the rating consumer acts on (F10.2). */
export const RATING_EVENT_TYPES = ['match.confirmed', 'match.forfeited', 'dispute.ruled'] as const;

type RatingReason = 'result' | 'forfeit' | 'ruling';

interface ApplyInput {
  gameId: string;
  matchId: string;
  /** Player A and their score; B gets 1 − scoreA. */
  a: string;
  b: string;
  scoreA: 0 | 0.5 | 1;
  decidedAt: Date;
  reason: RatingReason;
  sourceKey: string;
}

export interface VerifyReport {
  events: number;
  mismatches: ReplayMismatch[];
  /** Materialized profile values that differ from the replayed log. */
  profileMismatches: Array<{
    gameId: string;
    userId: string;
    field: 'rating' | 'ratedMatches';
    stored: number;
    recomputed: number;
  }>;
}

/**
 * Rating consumer (Sprint 10). Runs inside the outbox relay's per-consumer transaction,
 * which holds an advisory lock, so applications are strictly serialised and `seq` order
 * is the order ratings were computed in. That is what makes replay exact.
 */
@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  async handle(event: OutboxEvent): Promise<void> {
    await db.transaction(async (tx) => {
      if (event.type === 'match.confirmed') {
        const p = event.payload as {
          matchId: string;
          gameId: string;
          winnerUserId: string | null;
          loserUserId: string | null;
          draw: boolean;
          participants: [string, string];
          confirmedAt: string;
        };
        const [a, b] = p.draw ? p.participants : [p.winnerUserId!, p.loserUserId!];
        await this.apply(tx, {
          gameId: p.gameId,
          matchId: p.matchId,
          a: a!,
          b: b!,
          scoreA: p.draw ? 0.5 : 1,
          decidedAt: new Date(p.confirmedAt),
          reason: 'result',
          sourceKey: `match.confirmed:${p.matchId}`,
        });
        return;
      }

      if (event.type === 'match.forfeited') {
        // Forfeit policy (Sprint 8 spec §6): graded as a loss for the forfeiting side.
        const p = event.payload as {
          matchId: string;
          gameId: string;
          winnerUserId: string;
          forfeitingUserId: string;
          forfeitedAt: string;
        };
        await this.apply(tx, {
          gameId: p.gameId,
          matchId: p.matchId,
          a: p.winnerUserId,
          b: p.forfeitingUserId,
          scoreA: 1,
          decidedAt: new Date(p.forfeitedAt),
          reason: 'forfeit',
          sourceKey: `match.forfeited:${p.matchId}`,
        });
        return;
      }

      if (event.type === 'dispute.ruled') {
        const p = disputeRuledEventSchema.parse(event.payload);
        const sourceKey = `dispute.ruled:${p.disputeId}:${p.round}`;
        if (p.ratingAction === 'reverse' || p.ratingAction === 'reverse_and_apply') {
          await this.reverseMatch(tx, p.matchId, `${sourceKey}:reverse`, new Date(p.ruledAt));
        }
        if (p.ratingAction === 'apply' || p.ratingAction === 'reverse_and_apply') {
          const [a, b] = p.draw ? p.participants : [p.winnerUserId!, p.loserUserId!];
          await this.apply(tx, {
            gameId: p.gameId,
            matchId: p.matchId,
            a: a!,
            b: b!,
            scoreA: p.draw ? 0.5 : 1,
            decidedAt: new Date(p.ruledAt),
            reason: 'ruling',
            sourceKey,
          });
        }
      }
    });
  }

  /** Rates one result. Idempotent on `sourceKey`. */
  private async apply(tx: Tx, input: ApplyInput): Promise<void> {
    const r = schema.ratingEvents;
    const [done] = await tx
      .select({ id: r.id })
      .from(r)
      .where(eq(r.sourceKey, input.sourceKey))
      .limit(1);
    if (done) return;

    const profiles = await this.lockProfiles(tx, input.gameId, [input.a, input.b]);
    const pa = profiles.get(input.a);
    const pb = profiles.get(input.b);
    if (!pa || !pb) {
      this.logger.warn(`No game profile for a player of match ${input.matchId}; not rated`);
      return;
    }

    // Earlier applications for this pair inside the window (same rule as replay:
    // decided_at within 7 days of this result, regardless of later reversal).
    const windowStart = new Date(input.decidedAt.getTime() - REPEAT_WINDOW_MS);
    const [recentRow] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(r)
      .where(
        and(
          eq(r.gameId, input.gameId),
          eq(r.userId, input.a),
          eq(r.opponentId, input.b),
          eq(r.kind, 'apply'),
          sql`${r.decidedAt} > ${windowStart}`,
        ),
      );
    const recent = recentRow?.n ?? 0;

    const scoreB = (1 - input.scoreA) as 0 | 0.5 | 1;
    const result = rateMatch(
      {
        rating: pa.rating,
        ratedMatches: pa.ratedMatches,
        score: input.scoreA,
        recentVsOpponent: recent,
      },
      { rating: pb.rating, ratedMatches: pb.ratedMatches, score: scoreB, recentVsOpponent: recent },
    );

    const applyId = uuidv7();
    const rows = [
      { user: input.a, opp: input.b, score: input.scoreA, before: pa.rating, res: result.a },
      { user: input.b, opp: input.a, score: scoreB, before: pb.rating, res: result.b },
    ];
    for (const row of rows) {
      await tx.insert(r).values({
        id: uuidv7(),
        applyId,
        gameId: input.gameId,
        matchId: input.matchId,
        userId: row.user,
        opponentId: row.opp,
        kind: 'apply',
        reason: input.reason,
        sourceKey: input.sourceKey,
        score: row.score,
        decidedAt: input.decidedAt,
        kFactor: row.res.k,
        expected: row.res.expected,
        multiplier: row.res.multiplier,
        ratingBefore: row.before,
        delta: row.res.delta,
        ratingAfter: row.res.ratingAfter,
      });
    }
    for (const row of rows) {
      const p = profiles.get(row.user)!;
      await this.writeProfile(
        tx,
        p.id,
        input.gameId,
        row.user,
        row.res.ratingAfter,
        p.ratedMatches + 1,
      );
    }
    await this.audit(
      tx,
      input.matchId,
      applyId,
      input.reason,
      rows.map((x) => ({ userId: x.user, delta: x.res.delta })),
    );
  }

  /** Undoes the match's current (un-reversed) application exactly. Idempotent on `sourceKey`. */
  private async reverseMatch(tx: Tx, matchId: string, sourceKey: string, decidedAt: Date) {
    const r = schema.ratingEvents;
    const [done] = await tx.select({ id: r.id }).from(r).where(eq(r.sourceKey, sourceKey)).limit(1);
    if (done) return;

    const rev = alias(r, 'rev');
    const live = await tx
      .select()
      .from(r)
      .where(
        and(
          eq(r.matchId, matchId),
          eq(r.kind, 'apply'),
          notExists(
            tx
              .select({ x: sql`1` })
              .from(rev)
              .where(eq(rev.reversesApplyId, r.applyId)),
          ),
        ),
      )
      .orderBy(desc(r.seq))
      .limit(2);
    if (live.length !== 2) return; // nothing applied yet (e.g. first ruling was void)
    const applyId = live[0]!.applyId;
    const gameId = live[0]!.gameId;
    const profiles = await this.lockProfiles(
      tx,
      gameId,
      live.map((e) => e.userId),
    );

    const reverseId = uuidv7();
    for (const e of live.sort((x, y) => x.seq - y.seq)) {
      const p = profiles.get(e.userId);
      if (!p) continue;
      const after = p.rating - e.delta;
      await tx.insert(r).values({
        id: uuidv7(),
        applyId: reverseId,
        gameId,
        matchId,
        userId: e.userId,
        opponentId: e.opponentId,
        kind: 'reverse',
        reason: 'reversal',
        sourceKey,
        score: 0,
        decidedAt,
        reversesApplyId: applyId,
        ratingBefore: p.rating,
        delta: -e.delta,
        ratingAfter: after,
      });
      // Reversal keeps rated_matches: K depends on matches played, not on outcomes.
      await this.writeProfile(tx, p.id, gameId, e.userId, after, p.ratedMatches);
    }
    await this.audit(
      tx,
      matchId,
      reverseId,
      'reversal',
      live.map((e) => ({ userId: e.userId, delta: -e.delta })),
    );
  }

  private async lockProfiles(tx: Tx, gameId: string, userIds: string[]) {
    const rows = await tx
      .select({
        id: schema.gameProfiles.id,
        userId: schema.gameProfiles.userId,
        rating: schema.gameProfiles.rating,
        ratedMatches: schema.gameProfiles.ratedMatches,
      })
      .from(schema.gameProfiles)
      .where(
        and(eq(schema.gameProfiles.gameId, gameId), inArray(schema.gameProfiles.userId, userIds)),
      )
      .orderBy(asc(schema.gameProfiles.id))
      .for('update');
    return new Map(rows.map((row) => [row.userId, row]));
  }

  /**
   * Writes the materialized rating, then rebuilds W/L/D and streak from the player's
   * effective (un-reversed) applications, so reversals correct the record too.
   */
  private async writeProfile(
    tx: Tx,
    profileId: string,
    gameId: string,
    userId: string,
    rating: number,
    ratedMatches: number,
  ) {
    const r = schema.ratingEvents;
    const rev = alias(r, 'rev');
    const results = await tx
      .select({ score: r.score })
      .from(r)
      .where(
        and(
          eq(r.gameId, gameId),
          eq(r.userId, userId),
          eq(r.kind, 'apply'),
          notExists(
            tx
              .select({ x: sql`1` })
              .from(rev)
              .where(eq(rev.reversesApplyId, r.applyId)),
          ),
        ),
      )
      .orderBy(desc(r.seq));
    const wins = results.filter((x) => x.score === 1).length;
    const losses = results.filter((x) => x.score === 0).length;
    const draws = results.length - wins - losses;
    await tx
      .update(schema.gameProfiles)
      .set({
        rating,
        ratedMatches,
        provisional: isProvisional(ratedMatches),
        wins,
        losses,
        draws,
        streak: streakOf(results.map((x) => x.score)),
        updatedAt: new Date(),
      })
      .where(eq(schema.gameProfiles.id, profileId));
  }

  /** Rating changes are dispute evidence (Sprint 12 viewer): every application is audited. */
  private async audit(
    tx: Tx,
    matchId: string,
    applyId: string,
    reason: string,
    deltas: Array<{ userId: string; delta: number }>,
  ) {
    await tx.insert(schema.auditLog).values({
      id: uuidv7(),
      actorId: null,
      action: reason === 'reversal' ? 'rating.reversed' : 'rating.applied',
      objectType: 'match',
      objectId: matchId,
      after: { applyId, reason, deltas },
    });
    await tx.insert(schema.outboxEvents).values({
      id: uuidv7(),
      type: 'rating.updated',
      subjectId: matchId,
      payload: { matchId, applyId, reason, deltas },
    });
  }

  /**
   * PRD acceptance check: replays the whole log and compares every stored delta, every
   * rating, and every materialized profile with the recomputed values.
   */
  async verify(opts: { userIds?: string[] } = {}): Promise<VerifyReport> {
    const r = schema.ratingEvents;
    // `userIds` scopes the check to a closed set of players (tests share one database).
    const rows = await db
      .select()
      .from(r)
      .where(opts.userIds ? inArray(r.userId, opts.userIds) : undefined)
      .orderBy(asc(r.seq));
    const log: LoggedEvent[] = rows.map((e) => ({
      seq: e.seq,
      applyId: e.applyId,
      gameId: e.gameId,
      matchId: e.matchId,
      userId: e.userId,
      opponentId: e.opponentId,
      kind: e.kind as 'apply' | 'reverse',
      score: e.score,
      decidedAt: e.decidedAt,
      reversesApplyId: e.reversesApplyId,
      delta: e.delta,
      ratingAfter: e.ratingAfter,
    }));
    const result = replay(log);

    const profiles = await db
      .select({
        gameId: schema.gameProfiles.gameId,
        userId: schema.gameProfiles.userId,
        rating: schema.gameProfiles.rating,
        ratedMatches: schema.gameProfiles.ratedMatches,
      })
      .from(schema.gameProfiles)
      .where(opts.userIds ? inArray(schema.gameProfiles.userId, opts.userIds) : undefined);
    const profileMismatches: VerifyReport['profileMismatches'] = [];
    for (const p of profiles) {
      const k = `${p.gameId}:${p.userId}`;
      const rating = result.ratings.get(k) ?? START_RATING;
      const rated = result.ratedMatches.get(k) ?? 0;
      if (rating !== p.rating)
        profileMismatches.push({
          gameId: p.gameId,
          userId: p.userId,
          field: 'rating',
          stored: p.rating,
          recomputed: rating,
        });
      if (rated !== p.ratedMatches)
        profileMismatches.push({
          gameId: p.gameId,
          userId: p.userId,
          field: 'ratedMatches',
          stored: p.ratedMatches,
          recomputed: rated,
        });
    }
    return { events: rows.length, mismatches: result.mismatches, profileMismatches };
  }
}

/** Positive = current win streak, negative = loss streak, 0 after a draw or no matches. */
export function streakOf(scoresNewestFirst: number[]): number {
  const first = scoresNewestFirst[0];
  if (first === undefined || first === 0.5) return 0;
  let n = 0;
  for (const s of scoresNewestFirst) {
    if (s !== first) break;
    n += 1;
  }
  return first === 1 ? n : -n;
}
