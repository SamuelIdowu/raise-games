import type { ScorePayload } from '@raise/game-configs/results';

/**
 * Pure implementation of docs/sprints/sprint-08-spec.md §4 (pair matrix) and
 * §5 (timeout matrix). No I/O, so every cell is unit-tested.
 */

export type SubmissionKind = 'result' | 'no_show' | 'confirmation';
export type SubmittedOutcome = 'win' | 'loss' | 'draw' | 'no_show';

export interface SideSubmission {
  side: number;
  kind: SubmissionKind;
  outcome: SubmittedOutcome;
  /** `{ self, opponent }` from this side's point of view; `null` for no_show. */
  score: ScorePayload | null;
}

export type Resolution =
  | { status: 'confirmed'; winnerSide: number | null; via: 'agreement' | 'auto_timeout' }
  | { status: 'forfeited'; winnerSide: number; via: 'no_show_conceded' | 'no_show_timeout' }
  | { status: 'disputed'; reason: DisputeReason };

export type DisputeReason =
  'conflicting_outcomes' | 'conflicting_scores' | 'no_show_contested' | 'both_claimed_no_show';

const COMPLEMENT: Record<'win' | 'loss' | 'draw', 'win' | 'loss' | 'draw'> = {
  win: 'loss',
  loss: 'win',
  draw: 'draw',
};

export function mirrored(a: ScorePayload | null, b: ScorePayload | null): boolean {
  return !!a && !!b && a.self === b.opponent && a.opponent === b.self;
}

/** What a `confirmation` row stores: the other side's claim seen from this side. */
export function mirrorOf(other: SideSubmission): Pick<SideSubmission, 'outcome' | 'score'> {
  if (other.kind === 'no_show') return { outcome: 'loss', score: null };
  return {
    outcome: COMPLEMENT[other.outcome as 'win' | 'loss' | 'draw'],
    score: other.score ? { self: other.score.opponent, opponent: other.score.self } : null,
  };
}

function winnerFrom(sub: SideSubmission): number | null {
  if (sub.outcome === 'draw') return null;
  return sub.outcome === 'win' ? sub.side : 1 - sub.side;
}

/** Both sides have submitted. `first` is the earlier submission. */
export function resolvePair(first: SideSubmission, second: SideSubmission): Resolution {
  if (first.side === second.side) throw new Error('resolvePair needs one submission per side');
  if (first.kind === 'confirmation') throw new Error('a confirmation cannot be first');

  if (first.kind === 'no_show') {
    if (second.kind === 'no_show') return { status: 'disputed', reason: 'both_claimed_no_show' };
    if (second.kind === 'confirmation' || second.outcome === 'loss') {
      return { status: 'forfeited', winnerSide: first.side, via: 'no_show_conceded' };
    }
    return { status: 'disputed', reason: 'no_show_contested' };
  }

  // first is a result
  if (second.kind === 'no_show') return { status: 'disputed', reason: 'no_show_contested' };
  if (second.kind === 'confirmation') {
    return { status: 'confirmed', winnerSide: winnerFrom(first), via: 'agreement' };
  }

  const expected = COMPLEMENT[first.outcome as 'win' | 'loss' | 'draw'];
  if (second.outcome !== expected) return { status: 'disputed', reason: 'conflicting_outcomes' };
  if (!mirrored(first.score, second.score)) {
    return { status: 'disputed', reason: 'conflicting_scores' };
  }
  return { status: 'confirmed', winnerSide: winnerFrom(first), via: 'agreement' };
}

/** The confirmation window closed with only `only` on file. */
export function resolveTimeout(only: SideSubmission): Resolution {
  if (only.kind === 'no_show') {
    return { status: 'forfeited', winnerSide: only.side, via: 'no_show_timeout' };
  }
  return { status: 'confirmed', winnerSide: winnerFrom(only), via: 'auto_timeout' };
}
