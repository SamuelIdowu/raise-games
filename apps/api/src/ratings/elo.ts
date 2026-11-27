/**
 * Elo rating maths (Sprint 10, F10.1). Pure: no I/O, no clock. The rating consumer
 * calls `rateMatch` when it applies a result; the recompute check calls `replay` over
 * the stored event log and must reproduce every stored number exactly (PRD acceptance:
 * "recomputing from the rating event log reproduces every current rating exactly").
 *
 * PRD "Rules": start 1000; K = 32 for the first 20 rated matches, then 20; gains
 * diminish after 3 matches against the same opponent within 7 days. Parameters are
 * recorded in docs/decisions/0004-elo-parameters.md.
 */

export const START_RATING = 1000;
export const K_NEW = 32;
export const K_ESTABLISHED = 20;
/** K drops after this many rated matches (the 21st match uses K_ESTABLISHED). */
export const K_THRESHOLD = 20;
/** Provisional until this many rated matches (Design §8 / decision 0003). */
export const PROVISIONAL_UNTIL = 10;
export const REPEAT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Multiplier on *gains* for the Nth match against the same opponent inside the window.
 * Matches 1–3 are full value; the 4th is halved, the 5th quartered, the 6th and later
 * earn nothing. Losses are never reduced, so trading wins costs the pair rating.
 */
export function repeatMultiplier(nthAgainstOpponent: number): number {
  if (nthAgainstOpponent <= 3) return 1;
  if (nthAgainstOpponent === 4) return 0.5;
  if (nthAgainstOpponent === 5) return 0.25;
  return 0;
}

export function kFactor(ratedMatchesBefore: number): number {
  return ratedMatchesBefore < K_THRESHOLD ? K_NEW : K_ESTABLISHED;
}

/** Expected score of a player rated `rating` against `opponent` (logistic, 400 scale). */
export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - rating) / 400));
}

export interface PlayerState {
  rating: number;
  /** Rated result applications so far (reversals do not reduce it). */
  ratedMatches: number;
}

export interface SideInput extends PlayerState {
  /** 1 win, 0.5 draw, 0 loss. */
  score: 0 | 0.5 | 1;
  /** Earlier rated results against this same opponent within REPEAT_WINDOW_MS. */
  recentVsOpponent: number;
}

export interface SideResult {
  k: number;
  expected: number;
  multiplier: number;
  delta: number;
  ratingAfter: number;
}

/** Integer delta. Positive deltas are scaled by the repeat multiplier; losses are not. */
export function rateSide(me: SideInput, opponentRating: number): SideResult {
  const k = kFactor(me.ratedMatches);
  const expected = expectedScore(me.rating, opponentRating);
  const raw = k * (me.score - expected);
  const multiplier = raw > 0 ? repeatMultiplier(me.recentVsOpponent + 1) : 1;
  // Math.round on the same IEEE-754 inputs is deterministic, which replay relies on.
  const delta = Math.round(raw * multiplier);
  return { k, expected, multiplier, delta, ratingAfter: me.rating + delta };
}

export function rateMatch(a: SideInput, b: SideInput): { a: SideResult; b: SideResult } {
  if (a.score + b.score !== 1) throw new Error('scores must sum to 1');
  return { a: rateSide(a, b.rating), b: rateSide(b, a.rating) };
}

export function isProvisional(ratedMatches: number): boolean {
  return ratedMatches < PROVISIONAL_UNTIL;
}

// ---------------------------------------------------------------- replay

/** One stored row of the rating event log (both players of an application share `applyId`). */
export interface LoggedEvent {
  seq: number;
  applyId: string;
  gameId: string;
  matchId: string;
  userId: string;
  opponentId: string;
  kind: 'apply' | 'reverse';
  score: number;
  decidedAt: Date;
  /** For reversals: the applyId being undone. */
  reversesApplyId: string | null;
  delta: number;
  ratingAfter: number;
}

export interface ReplayMismatch {
  seq: number;
  userId: string;
  field: 'delta' | 'ratingAfter';
  stored: number;
  recomputed: number;
}

export interface ReplayResult {
  /** `${gameId}:${userId}` → rating. */
  ratings: Map<string, number>;
  ratedMatches: Map<string, number>;
  mismatches: ReplayMismatch[];
}

/**
 * Re-derives every delta from the log alone, in `seq` order, and reports any row whose
 * stored delta or rating differs. Apply rows are recomputed from the replayed ratings,
 * K and repeat counts; reverse rows must undo exactly the delta they reverse.
 */
export function replay(events: LoggedEvent[]): ReplayResult {
  const ratings = new Map<string, number>();
  const rated = new Map<string, number>();
  const history = new Map<string, number[]>(); // pairKey → decidedAt (ms) of applies
  const appliedDelta = new Map<string, number>(); // `${applyId}:${userId}` → delta
  const mismatches: ReplayMismatch[] = [];

  const key = (game: string, user: string) => `${game}:${user}`;
  const pair = (game: string, a: string, b: string) => `${game}:${[a, b].sort().join(':')}`;

  const groups = new Map<string, LoggedEvent[]>();
  for (const e of [...events].sort((x, y) => x.seq - y.seq || x.userId.localeCompare(y.userId))) {
    const list = groups.get(e.applyId) ?? [];
    list.push(e);
    groups.set(e.applyId, list);
  }

  const check = (e: LoggedEvent, delta: number, after: number) => {
    if (delta !== e.delta)
      mismatches.push({
        seq: e.seq,
        userId: e.userId,
        field: 'delta',
        stored: e.delta,
        recomputed: delta,
      });
    if (after !== e.ratingAfter)
      mismatches.push({
        seq: e.seq,
        userId: e.userId,
        field: 'ratingAfter',
        stored: e.ratingAfter,
        recomputed: after,
      });
  };

  for (const rows of groups.values()) {
    const first = rows[0]!;
    if (first.kind === 'reverse') {
      for (const e of rows) {
        const k = key(e.gameId, e.userId);
        const undo = -(appliedDelta.get(`${e.reversesApplyId}:${e.userId}`) ?? 0);
        const after = (ratings.get(k) ?? START_RATING) + undo;
        check(e, undo, after);
        ratings.set(k, after);
      }
      continue;
    }

    if (rows.length !== 2) throw new Error(`apply ${first.applyId} must have two rows`);
    const [x, y] = rows as [LoggedEvent, LoggedEvent];
    const pk = pair(x.gameId, x.userId, y.userId);
    const decided = x.decidedAt.getTime();
    const recent = (history.get(pk) ?? []).filter((t) => decided - t < REPEAT_WINDOW_MS).length;
    const side = (e: LoggedEvent): SideInput => ({
      rating: ratings.get(key(e.gameId, e.userId)) ?? START_RATING,
      ratedMatches: rated.get(key(e.gameId, e.userId)) ?? 0,
      score: e.score as 0 | 0.5 | 1,
      recentVsOpponent: recent,
    });
    const result = rateMatch(side(x), side(y));
    for (const [e, r] of [
      [x, result.a],
      [y, result.b],
    ] as const) {
      check(e, r.delta, r.ratingAfter);
      const k = key(e.gameId, e.userId);
      ratings.set(k, r.ratingAfter);
      rated.set(k, (rated.get(k) ?? 0) + 1);
      appliedDelta.set(`${e.applyId}:${e.userId}`, r.delta);
    }
    history.set(pk, [...(history.get(pk) ?? []), decided]);
  }

  return { ratings, ratedMatches: rated, mismatches };
}
