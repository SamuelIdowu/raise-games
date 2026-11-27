/**
 * Sprint 6 — challenge lifecycle and match state machine.
 *
 * Proves the PRD/TA acceptance criteria: two players cannot both accept (100-way race,
 * one winner), transitions are enforced in the domain AND the database, mutations are
 * idempotent, late cancel ends the match, expiry and match start are swept from row
 * timestamps, and every transition writes an outbox event.
 *
 * The Redis-outage proof (expiry still lands within a minute with Redis stopped) runs
 * with CHAOS=1 because it stops the `raise-redis` container.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { execSync } from 'node:child_process';
import {
  CHALLENGE_STATES,
  MATCH_STATES,
  canTransitionChallenge,
  canTransitionMatch,
} from '@raise/types';

import { AppModule } from './app.module';
import { ChallengesService } from './challenges/challenges.service';
import { ChallengeExpiryWorker, expireDueChallenges } from './challenges/challenges.expiry.worker';
import { startDueMatches } from './matches/match-start';
import { ReportsService } from './reports/reports.module';
import { db, schema } from './db/client';
import { retryOnDeadlock } from './test-fixtures/retry';

describe('Sprint 6 - challenge lifecycle & match state machine', () => {
  let moduleRef: TestingModule;
  let challenges: ChallengesService;
  let reports: ReportsService;
  let gameId = '';
  let gameKey = '';
  let formatKey = '';
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  let phone = 0;
  const run = Date.now().toString().slice(-5);

  async function player(name: string): Promise<string> {
    const id = uuidv7();
    await db.insert(schema.users).values({
      id,
      phone: `+23470${run}${String(phone++).padStart(4, '0')}`,
      displayName: name,
      tosVersionAccepted: '1.0',
    });
    await db.insert(schema.gameProfiles).values({
      id: uuidv7(),
      userId: id,
      gameId,
      inGameId: `${name}_${id.slice(-4)}`,
      rating: 1000,
    });
    userIds.push(id);
    return id;
  }

  async function post(
    posterId: string,
    extra: { targetPlayerId?: string; startsInMs?: number } = {},
  ) {
    const startsAt = new Date(Date.now() + (extra.startsInMs ?? 3600_000));
    const { id } = await challenges.createChallenge(posterId, {
      gameKey,
      formatKey,
      rules: 'Best of one',
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 3600_000).toISOString(),
      targetPlayerId: extra.targetPlayerId,
    });
    challengeIds.push(id);
    return id;
  }

  async function outboxTypes(subjectId: string): Promise<string[]> {
    const rows = await db
      .select({ type: schema.outboxEvents.type })
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.subjectId, subjectId));
    return rows.map((r) => r.type);
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    challenges = moduleRef.get(ChallengesService);
    reports = moduleRef.get(ReportsService);
    const [game] = await db.select().from(schema.games).where(eq(schema.games.key, 'efootball'));
    if (!game) throw new Error('Expected seeded game efootball');
    gameId = game.id;
    gameKey = game.key;
    const [format] = await db
      .select()
      .from(schema.gameFormats)
      .where(eq(schema.gameFormats.gameId, gameId))
      .limit(1);
    formatKey = format!.key;
  }, 60_000);

  afterAll(async () => {
    // Retried as a whole on a deadlock with the outbox relay (see test-fixtures/retry).
    await retryOnDeadlock(() => cleanup());
    await moduleRef?.close();
  }, 120_000);

  async function cleanup() {
    if (challengeIds.length) {
      const ms = await db
        .select({ id: schema.matches.id })
        .from(schema.matches)
        .where(inArray(schema.matches.challengeId, challengeIds));
      const matchIds = ms.map((m) => m.id);
      if (matchIds.length) {
        await db
          .delete(schema.outboxEvents)
          .where(inArray(schema.outboxEvents.subjectId, matchIds));
        await db.delete(schema.matches).where(inArray(schema.matches.id, matchIds));
      }
      await db
        .delete(schema.outboxEvents)
        .where(inArray(schema.outboxEvents.subjectId, challengeIds));
      await db.delete(schema.challenges).where(inArray(schema.challenges.id, challengeIds));
    }
    if (userIds.length) {
      await db.delete(schema.reports).where(inArray(schema.reports.reporterId, userIds));
      await db.delete(schema.outboxEvents).where(inArray(schema.outboxEvents.subjectId, userIds));
      await db
        .delete(schema.pairingCounters)
        .where(inArray(schema.pairingCounters.userAId, userIds));
      await db
        .delete(schema.pairingCounters)
        .where(inArray(schema.pairingCounters.userBId, userIds));
      await db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.userId, userIds));
      await db.delete(schema.users).where(inArray(schema.users.id, userIds));
    }
  }

  // ------------------------------------------------------------- F6.1 state machine
  describe('state machine (F6.1)', () => {
    it('DB transition guard matches the domain table for every pair', async () => {
      const mismatches: string[] = [];
      for (const from of MATCH_STATES) {
        for (const to of MATCH_STATES) {
          const r = await db.execute<{ ok: boolean }>(
            sql`select raise_match_transition_allowed(${from}, ${to}) as ok`,
          );
          if (r.rows[0]!.ok !== canTransitionMatch(from, to))
            mismatches.push(`match ${from}->${to}`);
        }
      }
      for (const from of CHALLENGE_STATES) {
        for (const to of CHALLENGE_STATES) {
          const r = await db.execute<{ ok: boolean }>(
            sql`select raise_challenge_transition_allowed(${from}, ${to}) as ok`,
          );
          if (r.rows[0]!.ok !== canTransitionChallenge(from, to))
            mismatches.push(`challenge ${from}->${to}`);
        }
      }
      expect(mismatches).toEqual([]);
    });

    it('blocks an illegal transition even from raw SQL', async () => {
      const a = await player('raw_a');
      const b = await player('raw_b');
      const cid = await post(a);
      const { matchId } = await challenges.acceptChallenge(cid, b);
      await expect(
        db.execute(sql`update matches set status = 'confirmed' where id = ${matchId}`),
      ).rejects.toMatchObject({
        cause: {
          message: expect.stringMatching(
            /illegal matches status transition: accepted -> confirmed/,
          ),
        },
      });
      await expect(
        db.execute(sql`update challenges set status = 'open' where id = ${cid}`),
      ).rejects.toMatchObject({
        cause: {
          message: expect.stringMatching(/illegal challenges status transition: accepted -> open/),
        },
      });
    });
  });

  // ------------------------------------------------------------- F6.2 create
  describe('create (F6.2)', () => {
    it('stores zero stake + fee-schedule version and emits challenge.created', async () => {
      const a = await player('create_a');
      const cid = await post(a);
      const [row] = await db.select().from(schema.challenges).where(eq(schema.challenges.id, cid));
      expect(row).toMatchObject({
        stakeAmountMinor: 0,
        currency: 'NGN',
        feeScheduleVersion: 1,
        status: 'open',
      });
      expect(row!.acceptanceDeadline.getTime() - row!.createdAt.getTime()).toBeGreaterThan(
        47.9 * 3600_000,
      );
      expect(await outboxTypes(cid)).toEqual(['challenge.created']);
    });

    it('10 concurrent retries with one idempotency key create exactly one challenge', async () => {
      const a = await player('idem_a');
      const key = uuidv7();
      const startsAt = new Date(Date.now() + 3600_000);
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          challenges.createChallenge(a, {
            gameKey,
            formatKey,
            rules: '',
            startsAt: startsAt.toISOString(),
            endsAt: new Date(startsAt.getTime() + 3600_000).toISOString(),
            idempotencyKey: key,
          }),
        ),
      );
      const ids = new Set(results.map((r) => r.id));
      expect(ids.size).toBe(1);
      challengeIds.push(...ids);
    });

    it("another player's idempotency key creates their own challenge (audit #6)", async () => {
      const a = await player('idem_scope_a');
      const b = await player('idem_scope_b');
      const key = uuidv7();
      const startsAt = new Date(Date.now() + 3600_000);
      const input = {
        gameKey,
        formatKey,
        rules: '',
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 3600_000).toISOString(),
        idempotencyKey: key,
      };
      const first = await challenges.createChallenge(a, input);
      const second = await challenges.createChallenge(b, input);
      challengeIds.push(first.id, second.id);
      expect(second.id).not.toBe(first.id);
    });

    it('rejects a start in the past and a format from another game', async () => {
      const a = await player('val_a');
      await expect(
        challenges.createChallenge(a, {
          gameKey,
          formatKey,
          rules: '',
          startsAt: new Date(Date.now() - 1000).toISOString(),
          endsAt: new Date(Date.now() + 3600_000).toISOString(),
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        challenges.createChallenge(a, {
          gameKey,
          formatKey: 'br_solo',
          rules: '',
          startsAt: new Date(Date.now() + 3600_000).toISOString(),
          endsAt: new Date(Date.now() + 7200_000).toISOString(),
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  // ------------------------------------------------------------- F6.3 accept/decline/cancel
  describe('accept / decline / cancel (F6.3)', () => {
    it('100 parallel accepts: exactly one winner, one match, two sides, no duplicates', async () => {
      const poster = await player('race_poster');
      const cid = await post(poster);
      const takers = await Promise.all(Array.from({ length: 100 }, (_, i) => player(`race_${i}`)));

      const results = await Promise.allSettled(
        takers.map((t) => challenges.acceptChallenge(cid, t)),
      );
      const wins = results.filter((r) => r.status === 'fulfilled');
      const losses = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(wins).toHaveLength(1);
      expect(losses).toHaveLength(99);
      expect(losses.every((l) => (l.reason as { status?: number }).status === 409)).toBe(true);

      const ms = await db.select().from(schema.matches).where(eq(schema.matches.challengeId, cid));
      expect(ms).toHaveLength(1);
      const sides = await db
        .select()
        .from(schema.matchSides)
        .where(eq(schema.matchSides.matchId, ms[0]!.id));
      const parts = await db
        .select()
        .from(schema.matchParticipants)
        .where(eq(schema.matchParticipants.matchId, ms[0]!.id));
      expect(sides).toHaveLength(2);
      expect(parts).toHaveLength(2);
      expect(ms[0]!.scheduledStartAt).toBeInstanceOf(Date);
    }, 120_000);

    it('a retry by the winner returns the same match (idempotent)', async () => {
      const a = await player('retry_a');
      const b = await player('retry_b');
      const cid = await post(a);
      const first = await challenges.acceptChallenge(cid, b);
      const again = await challenges.acceptChallenge(cid, b);
      expect(again.matchId).toBe(first.matchId);
      expect(await outboxTypes(cid)).toEqual(['challenge.created', 'challenge.accepted']);
      expect(await outboxTypes(first.matchId)).toEqual(['match.created']);
    });

    it('a cancelled challenge can never be accepted (stale read race)', async () => {
      const a = await player('stale_a');
      const b = await player('stale_b');
      const cid = await post(a);
      await challenges.cancelChallenge(cid, a);
      await expect(challenges.acceptChallenge(cid, b)).rejects.toMatchObject({ status: 409 });
      const [row] = await db.select().from(schema.challenges).where(eq(schema.challenges.id, cid));
      expect(row!.status).toBe('cancelled');
    });

    it('cancel and accept racing: exactly one of them wins', async () => {
      const a = await player('cx_a');
      const b = await player('cx_b');
      const cid = await post(a);
      const [cancel, accept] = await Promise.allSettled([
        challenges.cancelChallenge(cid, a),
        challenges.acceptChallenge(cid, b),
      ]);
      const [row] = await db.select().from(schema.challenges).where(eq(schema.challenges.id, cid));
      const ms = await db.select().from(schema.matches).where(eq(schema.matches.challengeId, cid));
      if (accept.status === 'fulfilled') {
        // Accept won; cancel then became a late cancel that ended the match.
        expect(cancel.status).toBe('fulfilled');
        expect(ms[0]!.status).toBe('cancelled');
      } else {
        expect(row!.status).toBe('cancelled');
        expect(ms).toHaveLength(0);
      }
    });

    it('late cancel ends the match and records reputation debt', async () => {
      const a = await player('late_a');
      const b = await player('late_b');
      const cid = await post(a);
      const { matchId } = await challenges.acceptChallenge(cid, b);
      await challenges.cancelChallenge(cid, a);
      const [m] = await db.select().from(schema.matches).where(eq(schema.matches.id, matchId));
      expect(m!.status).toBe('cancelled');
      expect(await outboxTypes(matchId)).toContain('match.cancelled');
      expect(await outboxTypes(a)).toContain('reputation.debt');
      // Retried cancel is a no-op.
      await expect(challenges.cancelChallenge(cid, a)).resolves.toBeUndefined();
    });

    it('refuses to cancel once results are being reported', async () => {
      const a = await player('inplay_a');
      const b = await player('inplay_b');
      const cid = await post(a);
      const { matchId } = await challenges.acceptChallenge(cid, b);
      await db
        .update(schema.matches)
        .set({ status: 'awaiting_confirmation' })
        .where(eq(schema.matches.id, matchId));
      await expect(challenges.cancelChallenge(cid, a)).rejects.toMatchObject({ status: 409 });
      const [row] = await db.select().from(schema.challenges).where(eq(schema.challenges.id, cid));
      expect(row!.status).toBe('accepted');
    });

    it('decline closes a direct challenge but leaves an open one on the board', async () => {
      const a = await player('dec_a');
      const b = await player('dec_b');
      const c = await player('dec_c');
      const direct = await post(a, { targetPlayerId: b });
      await challenges.declineChallenge(direct, b);
      await challenges.declineChallenge(direct, b); // retry no-op
      const open = await post(a);
      await challenges.declineChallenge(open, c);
      const rows = await db
        .select({ id: schema.challenges.id, status: schema.challenges.status })
        .from(schema.challenges)
        .where(inArray(schema.challenges.id, [direct, open]));
      expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({
        [direct]: 'cancelled',
        [open]: 'open',
      });
      await expect(challenges.acceptChallenge(direct, c)).rejects.toMatchObject({ status: 403 });
    });

    it('lists direct challenges for their target (forMe) and keeps them off the open board', async () => {
      const a = await player('forme_a');
      const b = await player('forme_b');
      const cid = await post(a, { targetPlayerId: b });
      const forMe = await challenges.listBoard(b, { status: 'open', forMe: 'true', limit: 50 });
      expect(forMe.items.find((i) => i.id === cid)).toMatchObject({ isForMe: true });
      const board = await challenges.listBoard(b, { status: 'open', limit: 50 });
      expect(board.items.some((i) => i.id === cid)).toBe(false);
    });

    it('detail includes the rules', async () => {
      const a = await player('detail_a');
      const cid = await post(a);
      const detail = await challenges.getChallenge(cid, a);
      expect(detail?.rules).toBe('Best of one');
    });
  });

  // ------------------------------------------------------------- expiry + start (F6.3, F6.5)
  describe('deadlines from row timestamps', () => {
    it('expires overdue open challenges only, with an outbox event', async () => {
      const a = await player('exp_a');
      const b = await player('exp_b');
      const overdue = await post(a);
      const accepted = await post(a);
      await challenges.acceptChallenge(accepted, b);
      await db
        .update(schema.challenges)
        .set({ acceptanceDeadline: new Date(Date.now() - 1000) })
        .where(inArray(schema.challenges.id, [overdue, accepted]));
      const expired = await expireDueChallenges(inArray(schema.challenges.id, [overdue, accepted]));
      expect(expired).toEqual([overdue]);
      expect(await outboxTypes(overdue)).toContain('challenge.expired');
      await expect(challenges.acceptChallenge(overdue, b)).rejects.toMatchObject({ status: 409 });
    });

    it('moves accepted matches to in_progress at the agreed start (F6.5)', async () => {
      const a = await player('start_a');
      const b = await player('start_b');
      const cid = await post(a);
      const { matchId } = await challenges.acceptChallenge(cid, b);
      await db
        .update(schema.matches)
        .set({ scheduledStartAt: new Date(Date.now() - 1000) })
        .where(eq(schema.matches.id, matchId));
      const started = await startDueMatches();
      expect(started).toContain(matchId);
      const [m] = await db.select().from(schema.matches).where(eq(schema.matches.id, matchId));
      expect(m!.status).toBe('in_progress');
      expect(m!.version).toBe(2);
      expect(await outboxTypes(matchId)).toEqual(['match.created', 'match.started']);
      expect(await startDueMatches()).not.toContain(matchId);
    });
  });

  // ------------------------------------------------------------- reports (F6.4)
  describe('reports (F6.4)', () => {
    it('reports a challenge once per reporter, never your own', async () => {
      const a = await player('rep_a');
      const b = await player('rep_b');
      const cid = await post(a);
      const first = await reports.create(
        { sub: b, sid: 'x', role: 'player' },
        { subjectType: 'challenge', subjectId: cid, reason: 'spam' },
      );
      const again = await reports.create(
        { sub: b, sid: 'x', role: 'player' },
        { subjectType: 'challenge', subjectId: cid, reason: 'spam' },
      );
      expect(first.alreadyReported).toBe(false);
      expect(again).toEqual({ reportId: first.reportId, alreadyReported: true });
      await expect(
        reports.create(
          { sub: a, sid: 'x', role: 'player' },
          { subjectType: 'challenge', subjectId: cid, reason: 'spam' },
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  // ------------------------------------------------------------- chaos (opt-in)
  describe.runIf(process.env.CHAOS === '1')('Redis outage (CHAOS=1)', () => {
    it('expires a challenge within one minute while Redis is stopped', async () => {
      const a = await player('chaos_a');
      const cid = await post(a);
      const worker = moduleRef.get(ChallengeExpiryWorker);
      execSync('docker stop raise-redis', { stdio: 'ignore' });
      try {
        await db
          .update(schema.challenges)
          .set({ acceptanceDeadline: new Date(Date.now() + 2000) })
          .where(eq(schema.challenges.id, cid));
        const deadline = Date.now() + 2000;
        // The worker's own 30s interval would get there; drive its sweep on the same
        // schedule to keep the test short, but only after the deadline has passed.
        let expiredAt = 0;
        while (Date.now() < deadline + 60_000) {
          await new Promise((r) => setTimeout(r, 5000));
          await worker.sweep();
          const [row] = await db
            .select({ status: schema.challenges.status })
            .from(schema.challenges)
            .where(and(eq(schema.challenges.id, cid)));
          if (row?.status === 'expired') {
            expiredAt = Date.now();
            break;
          }
        }
        expect(expiredAt).toBeGreaterThan(0);
        expect(expiredAt - deadline).toBeLessThan(60_000);
      } finally {
        execSync('docker start raise-redis', { stdio: 'ignore' });
      }
    }, 120_000);
  });
});
