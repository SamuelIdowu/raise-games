import { describe, expect, it } from 'vitest';
import {
  mirrorOf,
  resolvePair,
  resolveTimeout,
  type SideSubmission,
  type SubmittedOutcome,
} from './result-resolution';

const result = (
  side: number,
  outcome: SubmittedOutcome,
  self: number,
  opponent: number,
): SideSubmission => ({
  side,
  kind: 'result',
  outcome,
  score: { self, opponent },
});
const noShow = (side: number): SideSubmission => ({
  side,
  kind: 'no_show',
  outcome: 'no_show',
  score: null,
});
const confirmationOf = (side: number, other: SideSubmission): SideSubmission => ({
  side,
  kind: 'confirmation',
  ...mirrorOf(other),
});

describe('resolvePair: spec §4 matrix', () => {
  it('win + loss with mirrored scores → confirmed, winner is the win side', () => {
    expect(resolvePair(result(0, 'win', 3, 1), result(1, 'loss', 1, 3))).toEqual({
      status: 'confirmed',
      winnerSide: 0,
      via: 'agreement',
    });
    expect(resolvePair(result(1, 'loss', 0, 2), result(0, 'win', 2, 0))).toEqual({
      status: 'confirmed',
      winnerSide: 0,
      via: 'agreement',
    });
  });

  it('win + loss with non-mirrored scores → disputed (wrong-score bluff)', () => {
    expect(resolvePair(result(0, 'win', 3, 1), result(1, 'loss', 1, 2))).toEqual({
      status: 'disputed',
      reason: 'conflicting_scores',
    });
  });

  it('both claim the win, or both the loss → disputed', () => {
    expect(resolvePair(result(0, 'win', 2, 1), result(1, 'win', 2, 1))).toEqual({
      status: 'disputed',
      reason: 'conflicting_outcomes',
    });
    expect(resolvePair(result(0, 'loss', 1, 2), result(1, 'loss', 1, 2))).toEqual({
      status: 'disputed',
      reason: 'conflicting_outcomes',
    });
  });

  it('draw + draw with level scores → confirmed with no winner', () => {
    expect(resolvePair(result(0, 'draw', 1, 1), result(1, 'draw', 1, 1))).toEqual({
      status: 'confirmed',
      winnerSide: null,
      via: 'agreement',
    });
  });

  it('draw against win or loss → disputed', () => {
    expect(resolvePair(result(0, 'draw', 1, 1), result(1, 'win', 2, 1)).status).toBe('disputed');
    expect(resolvePair(result(0, 'win', 2, 1), result(1, 'draw', 1, 1)).status).toBe('disputed');
  });

  it('a result followed by a confirmation → confirmed as submitted', () => {
    const first = result(1, 'win', 4, 2);
    expect(resolvePair(first, confirmationOf(0, first))).toEqual({
      status: 'confirmed',
      winnerSide: 1,
      via: 'agreement',
    });
    const draw = result(0, 'draw', 0, 0);
    expect(resolvePair(draw, confirmationOf(1, draw))).toMatchObject({ winnerSide: null });
  });

  it('result against a no-show claim → disputed', () => {
    expect(resolvePair(result(0, 'win', 1, 0), noShow(1))).toEqual({
      status: 'disputed',
      reason: 'no_show_contested',
    });
  });

  it('no-show claim conceded (loss or confirmation) → forfeited, claimant wins', () => {
    expect(resolvePair(noShow(0), result(1, 'loss', 0, 1))).toEqual({
      status: 'forfeited',
      winnerSide: 0,
      via: 'no_show_conceded',
    });
    const claim = noShow(1);
    expect(resolvePair(claim, confirmationOf(0, claim))).toEqual({
      status: 'forfeited',
      winnerSide: 1,
      via: 'no_show_conceded',
    });
  });

  it('no-show claim contested by a win or draw → disputed', () => {
    expect(resolvePair(noShow(0), result(1, 'win', 1, 0))).toEqual({
      status: 'disputed',
      reason: 'no_show_contested',
    });
    expect(resolvePair(noShow(0), result(1, 'draw', 0, 0)).status).toBe('disputed');
  });

  it('both claim no-show → disputed', () => {
    expect(resolvePair(noShow(0), noShow(1))).toEqual({
      status: 'disputed',
      reason: 'both_claimed_no_show',
    });
  });

  it('refuses impossible inputs', () => {
    expect(() => resolvePair(result(0, 'win', 1, 0), result(0, 'loss', 0, 1))).toThrow();
    const first = result(0, 'win', 1, 0);
    expect(() => resolvePair(confirmationOf(1, first), first)).toThrow();
  });
});

describe('resolveTimeout: spec §5', () => {
  it('a lone result auto-confirms exactly as submitted', () => {
    expect(resolveTimeout(result(1, 'win', 2, 0))).toEqual({
      status: 'confirmed',
      winnerSide: 1,
      via: 'auto_timeout',
    });
    expect(resolveTimeout(result(1, 'loss', 0, 2))).toMatchObject({ winnerSide: 0 });
    expect(resolveTimeout(result(0, 'draw', 1, 1))).toMatchObject({ winnerSide: null });
  });

  it('a lone no-show claim forfeits the silent side', () => {
    expect(resolveTimeout(noShow(0))).toEqual({
      status: 'forfeited',
      winnerSide: 0,
      via: 'no_show_timeout',
    });
  });
});

describe('mirrorOf', () => {
  it('swaps outcome and score', () => {
    expect(mirrorOf(result(0, 'win', 3, 1))).toEqual({
      outcome: 'loss',
      score: { self: 1, opponent: 3 },
    });
    expect(mirrorOf(noShow(0))).toEqual({ outcome: 'loss', score: null });
  });
});
