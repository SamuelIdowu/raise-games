import { describe, expect, it } from 'vitest';
import {
  K_ESTABLISHED,
  K_NEW,
  PROVISIONAL_UNTIL,
  REPEAT_WINDOW_MS,
  START_RATING,
  expectedScore,
  isProvisional,
  kFactor,
  rateMatch,
  repeatMultiplier,
  replay,
  type LoggedEvent,
} from './elo';

const side = (rating: number, score: 0 | 0.5 | 1, ratedMatches = 0, recentVsOpponent = 0) => ({
  rating,
  score,
  ratedMatches,
  recentVsOpponent,
});

describe('PRD rules, verbatim', () => {
  it('starts at 1000', () => expect(START_RATING).toBe(1000));

  it('K = 32 for the first 20 rated matches, then 20', () => {
    expect(kFactor(0)).toBe(32);
    expect(kFactor(19)).toBe(32); // the 20th match is still K 32
    expect(kFactor(20)).toBe(20); // the 21st match uses K 20
    expect(K_NEW).toBe(32);
    expect(K_ESTABLISHED).toBe(20);
  });

  it('gains diminish after 3 matches against the same opponent within 7 days', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(repeatMultiplier)).toEqual([1, 1, 1, 0.5, 0.25, 0, 0]);
    expect(REPEAT_WINDOW_MS).toBe(7 * 24 * 3600 * 1000);
    const fourth = rateMatch(side(1000, 1, 5, 3), side(1000, 0, 5, 3));
    expect(fourth.a.delta).toBe(8); // 32 × 0.5 × 0.5
    expect(fourth.b.delta).toBe(-16); // the loss is not reduced
    const sixth = rateMatch(side(1000, 1, 5, 5), side(1000, 0, 5, 5));
    expect(sixth.a.delta).toBe(0);
    expect(sixth.b.delta).toBe(-16);
  });

  it('is provisional until 10 rated matches', () => {
    expect(PROVISIONAL_UNTIL).toBe(10);
    expect(isProvisional(9)).toBe(true);
    expect(isProvisional(10)).toBe(false);
  });
});

describe('Elo maths', () => {
  it('equal ratings: winner +16, loser −16 at K 32', () => {
    const r = rateMatch(side(1000, 1), side(1000, 0));
    expect(r.a.delta).toBe(16);
    expect(r.b.delta).toBe(-16);
  });

  it('is symmetric between the two players when K and multipliers match', () => {
    for (const [ra, rb] of [
      [1000, 1000],
      [1200, 1000],
      [900, 1450],
    ]) {
      const r = rateMatch(side(ra!, 1), side(rb!, 0));
      expect(r.a.delta + r.b.delta).toBeGreaterThanOrEqual(-1); // rounding only
      expect(r.a.delta + r.b.delta).toBeLessThanOrEqual(1);
    }
  });

  it('a draw moves the stronger player down and the weaker up', () => {
    const r = rateMatch(side(1200, 0.5), side(1000, 0.5));
    expect(r.a.delta).toBeLessThan(0);
    expect(r.b.delta).toBeGreaterThan(0);
    const level = rateMatch(side(1000, 0.5), side(1000, 0.5));
    expect(level.a.delta).toBe(0);
  });

  it('expected score matches the logistic curve (200 gap ≈ 0.76)', () => {
    expect(expectedScore(1200, 1000)).toBeCloseTo(0.7597, 4);
    expect(expectedScore(1000, 1000)).toBe(0.5);
  });

  it('rejects scores that do not sum to 1', () => {
    expect(() => rateMatch(side(1000, 1), side(1000, 1))).toThrow();
  });
});

// ---------------------------------------------------------------- replay

/** Deterministic PRNG (mulberry32), so a failing fuzz case can be reproduced. */
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a log the way the live consumer does (state carried forward, applies and
 * reversals interleaved), so replay must reproduce it exactly.
 */
function simulate(seed: number, n: number): LoggedEvent[] {
  const rand = rng(seed);
  const players = Array.from({ length: 12 }, (_, i) => `u${i.toString().padStart(2, '0')}`);
  const games = ['g1', 'g2'];
  const rating = new Map<string, number>();
  const rated = new Map<string, number>();
  const hist = new Map<string, number[]>();
  const live: Array<{
    applyId: string;
    game: string;
    a: string;
    b: string;
    da: number;
    db: number;
  }> = [];
  const log: LoggedEvent[] = [];
  let seq = 0;
  let clock = Date.UTC(2026, 0, 1);

  while (log.length < n) {
    clock += Math.floor(rand() * 36 * 3600 * 1000);
    const decidedAt = new Date(clock);
    if (live.length > 0 && rand() < 0.08) {
      const [undo] = live.splice(Math.floor(rand() * live.length), 1);
      seq += 1;
      const applyId = `r${seq}`;
      for (const [u, opp, d] of [
        [undo!.a, undo!.b, undo!.da],
        [undo!.b, undo!.a, undo!.db],
      ] as const) {
        const k = `${undo!.game}:${u}`;
        const after = (rating.get(k) ?? START_RATING) - d;
        rating.set(k, after);
        log.push({
          seq,
          applyId,
          gameId: undo!.game,
          matchId: undo!.applyId,
          userId: u,
          opponentId: opp,
          kind: 'reverse',
          score: 0,
          decidedAt,
          reversesApplyId: undo!.applyId,
          delta: -d,
          ratingAfter: after,
        });
      }
      continue;
    }
    const game = games[Math.floor(rand() * games.length)]!;
    // Favour a few pairs so the repeat-opponent rule triggers often.
    const ai = Math.floor(rand() * (rand() < 0.5 ? 3 : players.length));
    let bi = Math.floor(rand() * (rand() < 0.5 ? 3 : players.length));
    if (bi === ai) bi = (ai + 1) % players.length;
    const a = players[ai]!;
    const b = players[bi]!;
    const roll = rand();
    const scoreA: 0 | 0.5 | 1 = roll < 0.45 ? 1 : roll < 0.9 ? 0 : 0.5;
    const pk = `${game}:${[a, b].sort().join(':')}`;
    const recent = (hist.get(pk) ?? []).filter((t) => clock - t < REPEAT_WINDOW_MS).length;
    const st = (u: string, score: 0 | 0.5 | 1) => ({
      rating: rating.get(`${game}:${u}`) ?? START_RATING,
      ratedMatches: rated.get(`${game}:${u}`) ?? 0,
      score,
      recentVsOpponent: recent,
    });
    const r = rateMatch(st(a, scoreA), st(b, (1 - scoreA) as 0 | 0.5 | 1));
    seq += 1;
    const applyId = `a${seq}`;
    for (const [u, opp, res, score] of [
      [a, b, r.a, scoreA],
      [b, a, r.b, 1 - scoreA],
    ] as const) {
      rating.set(`${game}:${u}`, res.ratingAfter);
      rated.set(`${game}:${u}`, (rated.get(`${game}:${u}`) ?? 0) + 1);
      log.push({
        seq,
        applyId,
        gameId: game,
        matchId: applyId,
        userId: u,
        opponentId: opp,
        kind: 'apply',
        score,
        decidedAt,
        reversesApplyId: null,
        delta: res.delta,
        ratingAfter: res.ratingAfter,
      });
    }
    hist.set(pk, [...(hist.get(pk) ?? []), clock]);
    live.push({ applyId, game, a, b, da: r.a.delta, db: r.b.delta });
  }
  return log;
}

describe('replay (recompute-equality property)', () => {
  it('reproduces every stored delta and rating for 10,000 random events', () => {
    for (const seed of [1, 7, 42]) {
      const log = simulate(seed, 10_000);
      const result = replay(log);
      expect(result.mismatches).toEqual([]);
      // Final ratings equal the last stored ratingAfter per (game, player).
      const last = new Map<string, number>();
      for (const e of log) last.set(`${e.gameId}:${e.userId}`, e.ratingAfter);
      expect(result.ratings).toEqual(last);
    }
  });

  it('is order-independent of how rows arrive (sorts by seq)', () => {
    const log = simulate(3, 500);
    const shuffled = [...log].reverse();
    expect(replay(shuffled).mismatches).toEqual([]);
  });

  it('detects a tampered delta', () => {
    const log = simulate(5, 200);
    const target = log.find((e) => e.kind === 'apply' && e.delta !== 0)!;
    target.delta += 1;
    const { mismatches } = replay(log);
    expect(mismatches.some((m) => m.seq === target.seq && m.field === 'delta')).toBe(true);
  });

  it('a reversal restores both players exactly', () => {
    const d = new Date(Date.UTC(2026, 0, 1));
    const log: LoggedEvent[] = [
      {
        seq: 1,
        applyId: 'a1',
        gameId: 'g',
        matchId: 'm',
        userId: 'x',
        opponentId: 'y',
        kind: 'apply',
        score: 1,
        decidedAt: d,
        reversesApplyId: null,
        delta: 16,
        ratingAfter: 1016,
      },
      {
        seq: 1,
        applyId: 'a1',
        gameId: 'g',
        matchId: 'm',
        userId: 'y',
        opponentId: 'x',
        kind: 'apply',
        score: 0,
        decidedAt: d,
        reversesApplyId: null,
        delta: -16,
        ratingAfter: 984,
      },
      {
        seq: 2,
        applyId: 'r2',
        gameId: 'g',
        matchId: 'm',
        userId: 'x',
        opponentId: 'y',
        kind: 'reverse',
        score: 0,
        decidedAt: d,
        reversesApplyId: 'a1',
        delta: -16,
        ratingAfter: 1000,
      },
      {
        seq: 2,
        applyId: 'r2',
        gameId: 'g',
        matchId: 'm',
        userId: 'y',
        opponentId: 'x',
        kind: 'reverse',
        score: 0,
        decidedAt: d,
        reversesApplyId: 'a1',
        delta: 16,
        ratingAfter: 1000,
      },
    ];
    const r = replay(log);
    expect(r.mismatches).toEqual([]);
    expect(r.ratings.get('g:x')).toBe(1000);
    expect(r.ratings.get('g:y')).toBe(1000);
  });
});
