/**
 * Sprint 10 — Elo ratings, leaderboards, profile stats. Needs Postgres and Redis.
 * Drives the real rating consumer with the exact event shapes Sprints 8 and 9 emit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { AppModule } from './app.module';
import { db, schema } from './db/client';
import { RatingsService } from './ratings/ratings.service';
import { LeaderboardsService } from './ratings/leaderboards.service';
import { ReputationService } from './ratings/reputation.service';
import { MatchesService } from './matches/matches.service';
import { OutboxRelay, type OutboxEvent } from './realtime/outbox-relay';
import { retryOnDeadlock } from './test-fixtures/retry';

describe('Sprint 10 - ratings & leaderboards', () => {
  let moduleRef: TestingModule;
  let ratings: RatingsService;
  let boards: LeaderboardsService;
  let reputation: ReputationService;
  let matches: MatchesService;
  let relay: OutboxRelay;
  let gameId = '';
  let gameKey = '';
  let formatId = '';
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const matchIds: string[] = [];
  let phone = Math.floor(Math.random() * 1_000_000);
  const tag = uuidv7().slice(-6);

  async function player(name: string, extra: { campus?: string } = {}) {
    const id = uuidv7();
    await db.insert(schema.users).values({
      id,
      phone: `+23470${(phone++).toString().padStart(8, '0')}`,
      displayName: `${name}_${id.slice(-6)}`,
      tosVersionAccepted: '1.0',
    });
    userIds.push(id);
    await db.insert(schema.gameProfiles).values({
      id: uuidv7(),
      userId: id,
      gameId,
      inGameId: `${name}_${id.slice(-6)}`,
      campus: extra.campus ?? null,
    });
    return id;
  }

  /** A match between a and b in the given status (sides 0 = a, 1 = b). */
  async function match(a: string, b: string, status = 'confirmed', winnerSide: number | null = 0) {
    const challengeId = uuidv7();
    const now = new Date();
    await db.insert(schema.challenges).values({
      id: challengeId,
      gameId,
      formatId,
      posterId: a,
      status: 'accepted',
      startsAt: new Date(now.getTime() - 3600_000),
      endsAt: now,
      acceptanceDeadline: new Date(now.getTime() - 7200_000),
      acceptedById: b,
      acceptedAt: new Date(now.getTime() - 7000_000),
    });
    challengeIds.push(challengeId);
    const matchId = uuidv7();
    await db.insert(schema.matches).values({
      id: matchId,
      challengeId,
      status: status as 'confirmed',
      winnerSide,
    });
    matchIds.push(matchId);
    const profiles = await db
      .select({ id: schema.gameProfiles.id, userId: schema.gameProfiles.userId })
      .from(schema.gameProfiles)
      .where(
        and(eq(schema.gameProfiles.gameId, gameId), inArray(schema.gameProfiles.userId, [a, b])),
      );
    const pid = (u: string) => profiles.find((p) => p.userId === u)!.id;
    await db.insert(schema.matchSides).values([
      { id: uuidv7(), matchId, userId: a, gameProfileId: pid(a), side: 0, isPoster: true },
      { id: uuidv7(), matchId, userId: b, gameProfileId: pid(b), side: 1, isAcceptor: true },
    ]);
    return matchId;
  }

  const event = (type: string, payload: Record<string, unknown>): OutboxEvent => ({
    id: uuidv7(),
    type,
    subjectId: String(payload.matchId ?? payload.disputeId),
    payload,
    createdAt: new Date(),
    processedAt: null,
  });

  const confirmed = (
    matchId: string,
    winner: string,
    loser: string,
    at = new Date(),
    draw = false,
  ) =>
    event('match.confirmed', {
      matchId,
      gameId,
      winnerUserId: draw ? null : winner,
      loserUserId: draw ? null : loser,
      draw,
      participants: [winner, loser],
      via: 'agreement',
      confirmedAt: at.toISOString(),
    });

  const ruled = (
    matchId: string,
    round: 1 | 2,
    winner: string | null,
    loser: string | null,
    ratingAction: 'apply' | 'reverse_and_apply' | 'reverse' | 'none',
    opts: {
      draw?: boolean;
      void?: boolean;
      disputeId?: string;
      participants?: [string, string];
    } = {},
  ) =>
    event('dispute.ruled', {
      disputeId: opts.disputeId ?? uuidv7(),
      matchId,
      gameId,
      round,
      outcome: opts.void ? 'void' : opts.draw ? 'draw' : 'side0_win',
      previousOutcome: round === 2 ? 'side1_win' : null,
      winnerUserId: winner,
      loserUserId: loser,
      draw: Boolean(opts.draw),
      void: Boolean(opts.void),
      participants: opts.participants ?? [winner ?? userIds[0]!, loser ?? userIds[1]!],
      ratingAction,
      final: round === 2,
      ruledAt: new Date().toISOString(),
      resolutionMs: 1000,
    });

  async function profile(userId: string) {
    const [p] = await db
      .select()
      .from(schema.gameProfiles)
      .where(and(eq(schema.gameProfiles.gameId, gameId), eq(schema.gameProfiles.userId, userId)));
    return p!;
  }

  async function events(matchId: string) {
    return db
      .select()
      .from(schema.ratingEvents)
      .where(eq(schema.ratingEvents.matchId, matchId))
      .orderBy(schema.ratingEvents.seq);
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    ratings = moduleRef.get(RatingsService);
    boards = moduleRef.get(LeaderboardsService);
    reputation = moduleRef.get(ReputationService);
    matches = moduleRef.get(MatchesService);
    relay = moduleRef.get(OutboxRelay);
    const [game] = await db.select().from(schema.games).where(eq(schema.games.key, 'efootball'));
    gameId = game!.id;
    gameKey = game!.key;
    const [format] = await db
      .select()
      .from(schema.gameFormats)
      .where(eq(schema.gameFormats.gameId, gameId))
      .limit(1);
    formatId = format!.id;
  }, 60_000);

  afterAll(async () => {
    // Retried as a whole on a deadlock with the outbox relay (see test-fixtures/retry).
    await retryOnDeadlock(async () => {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL raise.allow_purge = 'on'`);
        if (matchIds.length) {
          await tx
            .delete(schema.outboxEvents)
            .where(inArray(schema.outboxEvents.subjectId, matchIds));
          await tx.delete(schema.matches).where(inArray(schema.matches.id, matchIds)); // cascades rating_events
        }
      });
      if (challengeIds.length)
        await db.delete(schema.challenges).where(inArray(schema.challenges.id, challengeIds));
      if (userIds.length) {
        await db.delete(schema.sanctions).where(inArray(schema.sanctions.userId, userIds));
        await db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.userId, userIds));
        await db.delete(schema.users).where(inArray(schema.users.id, userIds));
      }
    });
    await moduleRef?.close();
  }, 60_000);

  // ------------------------------------------------------------ F10.1 / F10.2
  describe('rating consumer (F10.1, F10.2)', () => {
    it('a confirmed win rates both players, logs two events, and updates stats', async () => {
      const a = await player('win');
      const b = await player('lose');
      const m = await match(a, b);
      await ratings.handle(confirmed(m, a, b));

      const [ea, eb] = await events(m);
      expect(ea).toMatchObject({
        userId: a,
        kind: 'apply',
        reason: 'result',
        score: 1,
        kFactor: 32,
        delta: 16,
        ratingBefore: 1000,
        ratingAfter: 1016,
      });
      expect(eb).toMatchObject({ userId: b, score: 0, delta: -16, ratingAfter: 984 });
      expect(ea!.applyId).toBe(eb!.applyId);
      expect(await profile(a)).toMatchObject({
        rating: 1016,
        ratedMatches: 1,
        wins: 1,
        losses: 0,
        streak: 1,
        provisional: true,
      });
      expect(await profile(b)).toMatchObject({ rating: 984, losses: 1, streak: -1 });
    });

    it('is idempotent: a redelivered event changes nothing', async () => {
      const a = await player('idem_a');
      const b = await player('idem_b');
      const m = await match(a, b);
      const e = confirmed(m, a, b);
      await ratings.handle(e);
      await ratings.handle(e);
      expect(await events(m)).toHaveLength(2);
      expect((await profile(a)).rating).toBe(1016);
    });

    it('draws score 0.5 each; equal ratings move nobody', async () => {
      const a = await player('draw_a');
      const b = await player('draw_b');
      const m = await match(a, b, 'confirmed', null);
      await ratings.handle(confirmed(m, a, b, new Date(), true));
      expect((await events(m)).map((e) => [e.score, e.delta])).toEqual([
        [0.5, 0],
        [0.5, 0],
      ]);
      expect(await profile(a)).toMatchObject({ draws: 1, streak: 0 });
    });

    it('a forfeit is graded as a loss for the forfeiting side', async () => {
      const a = await player('ff_win');
      const b = await player('ff_noshow');
      const m = await match(a, b, 'forfeited');
      await ratings.handle(
        event('match.forfeited', {
          matchId: m,
          gameId,
          winnerUserId: a,
          forfeitingUserId: b,
          forfeitedAt: new Date().toISOString(),
        }),
      );
      const rows = await events(m);
      expect(rows.map((r) => r.reason)).toEqual(['forfeit', 'forfeit']);
      expect((await profile(b)).rating).toBe(984);
    });

    it('rulings: apply, appeal reversal-and-apply, and a voiding appeal restore exactly', async () => {
      const a = await player('rule_a');
      const b = await player('rule_b');
      const m = await match(a, b, 'resolved', 0);
      const disputeId = uuidv7();
      await ratings.handle(ruled(m, 1, a, b, 'apply', { disputeId }));
      expect((await profile(a)).rating).toBe(1016);

      // Appeal flips the winner: reverse the first application, apply the new one.
      await ratings.handle(ruled(m, 2, b, a, 'reverse_and_apply', { disputeId }));
      const rows = await events(m);
      expect(rows.map((r) => `${r.kind}:${r.reason}`)).toEqual([
        'apply:ruling',
        'apply:ruling',
        'reverse:reversal',
        'reverse:reversal',
        'apply:ruling',
        'apply:ruling',
      ]);
      expect((await profile(b)).rating).toBe(1016);
      expect((await profile(a)).rating).toBe(984);
      // K counts matches played: both players now have 2 rated applications, record shows 1 result.
      expect(await profile(a)).toMatchObject({ ratedMatches: 2, wins: 0, losses: 1 });

      // An appeal that voids the match undoes its application exactly.
      const m2 = await match(a, b, 'resolved', 0);
      const d2 = uuidv7();
      const beforeA = (await profile(a)).rating;
      const beforeB = (await profile(b)).rating;
      await ratings.handle(ruled(m2, 1, a, b, 'apply', { disputeId: d2 }));
      expect((await profile(a)).rating).not.toBe(beforeA);
      await ratings.handle(
        ruled(m2, 2, null, null, 'reverse', { disputeId: d2, void: true, participants: [a, b] }),
      );
      expect((await profile(a)).rating).toBe(beforeA);
      expect((await profile(b)).rating).toBe(beforeB);
    });

    it('a first-round void changes nothing', async () => {
      const a = await player('void_a');
      const b = await player('void_b');
      const m = await match(a, b, 'voided', null);
      await ratings.handle(ruled(m, 1, null, null, 'none', { void: true, participants: [a, b] }));
      expect(await events(m)).toHaveLength(0);
      expect((await profile(a)).rating).toBe(1000);
    });

    it('gains diminish from the 4th match against the same opponent within 7 days', async () => {
      const a = await player('rep_a');
      const b = await player('rep_b');
      const deltas: number[] = [];
      for (let i = 0; i < 6; i++) {
        const m = await match(a, b);
        await ratings.handle(confirmed(m, a, b, new Date(Date.now() + i * 60_000)));
        deltas.push((await events(m)).find((e) => e.userId === a)!.delta);
      }
      expect(
        (await events(matchIds[matchIds.length - 1]!)).find((e) => e.userId === a)!.multiplier,
      ).toBe(0);
      expect(deltas[3]).toBeLessThan(deltas[2]!); // 4th halved
      expect(deltas[5]).toBe(0); // 6th earns nothing
    });

    it('K drops from 32 to 20 on the 21st rated match', async () => {
      const a = await player('k_a');
      const opponents = await Promise.all(Array.from({ length: 21 }, (_, i) => player(`k_o${i}`)));
      let last = 0;
      for (const [i, o] of opponents.entries()) {
        const m = await match(a, o);
        await ratings.handle(
          confirmed(m, i % 2 ? a : o, i % 2 ? o : a, new Date(Date.now() + i * 1000)),
        );
        last = (await events(m)).find((e) => e.userId === a)!.kFactor!;
        if (i === 19) expect(last).toBe(32);
      }
      expect(last).toBe(20);
      expect(await profile(a)).toMatchObject({ ratedMatches: 21, provisional: false });
    });

    it('rating events are append-only at the SQL level', async () => {
      const a = await player('ao_a');
      const b = await player('ao_b');
      const m = await match(a, b);
      await ratings.handle(confirmed(m, a, b));
      const [row] = await events(m);
      const err = (p: Promise<unknown>) =>
        p.then(
          () => 'no error',
          (e: { cause?: { message?: string } }) => e.cause?.message ?? String(e),
        );
      expect(
        await err(db.execute(sql`UPDATE rating_events SET delta = 99 WHERE id = ${row!.id}`)),
      ).toMatch(/append-only/);
      expect(await err(db.execute(sql`DELETE FROM rating_events WHERE id = ${row!.id}`))).toMatch(
        /append-only/,
      );
    });

    it('PRD acceptance: replaying the log reproduces every rating exactly (fuzzed through the real consumer)', async () => {
      const pool = await Promise.all(Array.from({ length: 8 }, (_, i) => player(`fz${i}_${tag}`)));
      let seed = 12345;
      const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      const applied: Array<{ m: string; d: string; a: string; b: string }> = [];
      for (let i = 0; i < 120; i++) {
        const ai = Math.floor(rand() * pool.length);
        const bi = (ai + 1 + Math.floor(rand() * (pool.length - 1))) % pool.length;
        const [a, b] = [pool[ai]!, pool[bi]!];
        const roll = rand();
        const at = new Date(Date.now() + i * 3_600_000);
        if (roll < 0.1 && applied.length) {
          const x = applied.splice(Math.floor(rand() * applied.length), 1)[0]!;
          await ratings.handle(ruled(x.m, 2, x.b, x.a, 'reverse_and_apply', { disputeId: x.d }));
        } else if (roll < 0.25) {
          const m = await match(a, b, 'resolved', 0);
          const d = uuidv7();
          await ratings.handle(ruled(m, 1, a, b, 'apply', { disputeId: d }));
          applied.push({ m, d, a, b });
        } else {
          const m = await match(a, b, 'confirmed', roll < 0.35 ? null : 0);
          await ratings.handle(confirmed(m, a, b, at, roll < 0.35));
        }
      }
      const report = await ratings.verify({ userIds: pool });
      expect(report.events).toBeGreaterThan(200);
      expect(report.mismatches).toEqual([]);
      expect(report.profileMismatches).toEqual([]);
    });

    it('through the outbox relay, a confirmed result is rated well inside 5 seconds', async () => {
      const a = await player('fast_a');
      const b = await player('fast_b');
      const m = await match(a, b);
      const e = confirmed(m, a, b);
      await db
        .insert(schema.outboxEvents)
        .values({ id: e.id, type: e.type, subjectId: m, payload: e.payload });
      const start = performance.now();
      // drain() returns 0 at once while another drain holds this consumer (this
      // instance's timer, or another test file's relay on the shared database), so poll.
      while ((await events(m)).length === 0 && performance.now() - start < 5000) {
        await relay.drain();
        await new Promise((r) => setTimeout(r, 25));
      }
      const elapsed = performance.now() - start;
      expect(await events(m)).toHaveLength(2);
      expect(elapsed).toBeLessThan(5000);
      process.stdout.write(`[sprint10] outbox → rating applied: ${elapsed.toFixed(0)}ms\n`);
    });
  });

  // ---------------------------------------------------------------- F10.3
  describe('leaderboard (F10.3)', () => {
    it('lists rated players only, ranks by rating, flags provisional, filters by campus, pins me', async () => {
      const campus = `Campus_${tag}`;
      const top = await player('lb_top', { campus });
      const low = await player('lb_low', { campus });
      const pending = await player('lb_pending', { campus });
      const m = await match(top, low);
      await ratings.handle(confirmed(m, top, low));
      await match(pending, low, 'awaiting_confirmation', null); // not confirmed: never ranked

      const page = await boards.page(gameKey, low, { campus, period: 'all_time', limit: 25 });
      expect(page.items.map((r) => r.userId)).toEqual([top, low]);
      expect(page.items[0]).toMatchObject({
        rank: 1,
        rating: 1016,
        provisional: true,
        wins: 1,
        trend: { direction: 'up', delta: 16 },
      });
      expect(page.items[1]).toMatchObject({ rank: 2, trend: { direction: 'down' } });
      expect(page.items.some((r) => r.userId === pending)).toBe(false);
      expect(page.me).toMatchObject({ userId: low, rank: 2 });
      expect(page.version).toBeGreaterThan(0);

      const other = await boards.page(gameKey, low, {
        campus: `Elsewhere_${tag}`,
        period: 'all_time',
        limit: 25,
      });
      expect(other.items).toHaveLength(0);
      expect(other.me).toBeNull();
    });

    it('pages with a cursor without gaps or duplicates', async () => {
      const campus = `Paging_${tag}`;
      const ps = await Promise.all(
        Array.from({ length: 5 }, (_, i) => player(`pg${i}`, { campus })),
      );
      for (let i = 0; i < ps.length - 1; i++) {
        const m = await match(ps[i]!, ps[i + 1]!);
        await ratings.handle(confirmed(m, ps[i]!, ps[i + 1]!, new Date(Date.now() + i * 1000)));
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await boards.page(gameKey, ps[0]!, {
          campus,
          period: 'all_time',
          limit: 2,
          cursor,
        });
        seen.push(...page.items.map((r) => r.userId));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(new Set(seen).size).toBe(5);
      expect(seen).toHaveLength(5);
    });
  });

  // ---------------------------------------------------------------- F10.4 data
  describe('profile stats + reputation (F10.4)', () => {
    it('reputation: New, then Reliable/Trusted from completion, Low with an active sanction', async () => {
      const a = await player('rp_a');
      const b = await player('rp_b');
      expect((await reputation.forUsers([a])).get(a)).toBe('new');
      for (let i = 0; i < 6; i++) await match(a, b, 'confirmed', 0);
      expect((await reputation.forUsers([a])).get(a)).toBe('reliable');
      await db.insert(schema.sanctions).values({
        id: uuidv7(),
        userId: a,
        type: 'warning',
        reason: 'test',
        startsAt: new Date(Date.now() - 1000),
      } as typeof schema.sanctions.$inferInsert);
      expect((await reputation.forUsers([a])).get(a)).toBe('low');
    });

    it('the match view carries the viewer’s rating change for the count-up summary', async () => {
      const a = await player('mv_a');
      const b = await player('mv_b');
      const m = await match(a, b);
      await ratings.handle(confirmed(m, a, b));
      const view = await matches.getView(m, { sub: a, sid: 't', role: 'player' });
      expect(view.ratingDelta).toBe(16);
      expect(view.me?.rating).toBe(1016);
      expect((await matches.getView(m, { sub: b, sid: 't', role: 'player' })).ratingDelta).toBe(
        -16,
      );
    });
  });
});
