import { describe, expect, it } from 'vitest';
import { games } from './index';
import { SCORE_BOUNDS, compareScore, validateResult } from './results';

const goals = {
  outcomeOptions: ['win', 'loss'] as ('win' | 'loss' | 'draw')[],
  scoreModel: 'goals' as const,
  drawAllowed: false,
};
const placement = { ...goals, scoreModel: 'placement' as const };
const goalsWithDraw = { ...goals, drawAllowed: true };

describe('validateResult', () => {
  it('accepts a consistent win and loss for every launch format', () => {
    for (const game of games) {
      for (const format of game.formats) {
        const rs = format.resultSchema;
        const b = SCORE_BOUNDS[rs.scoreModel];
        const better =
          b.better === 'higher'
            ? { self: b.min + 2, opponent: b.min + 1 }
            : { self: b.min, opponent: b.min + 1 };
        expect(validateResult(rs, 'win', better), `${game.key}/${format.key}`).toEqual({
          ok: true,
        });
        expect(
          validateResult(rs, 'loss', { self: better.opponent, opponent: better.self }),
        ).toEqual({ ok: true });
      }
    }
  });

  it('only allows the documented key names', () => {
    expect(validateResult(goals, 'win', { self: 2, opponent: 1, extra: 0 })).toEqual({
      ok: false,
      error: 'score_keys',
    });
    expect(validateResult(goals, 'win', { home: 2, away: 1 })).toEqual({
      ok: false,
      error: 'score_keys',
    });
    expect(validateResult(goals, 'win', { self: 2 })).toEqual({ ok: false, error: 'score_keys' });
    expect(validateResult(goals, 'win', { self: 2.5, opponent: 1 })).toEqual({
      ok: false,
      error: 'score_keys',
    });
    expect(validateResult(goals, 'win', null)).toEqual({ ok: false, error: 'score_keys' });
  });

  it('enforces score bounds (forced-bounds cheat)', () => {
    expect(validateResult(goals, 'win', { self: 100, opponent: 0 })).toEqual({
      ok: false,
      error: 'score_out_of_bounds',
    });
    expect(validateResult(goals, 'loss', { self: -1, opponent: 0 })).toEqual({
      ok: false,
      error: 'score_out_of_bounds',
    });
    expect(validateResult(placement, 'win', { self: 0, opponent: 3 })).toEqual({
      ok: false,
      error: 'score_out_of_bounds',
    });
    expect(validateResult(placement, 'loss', { self: 101, opponent: 3 })).toEqual({
      ok: false,
      error: 'score_out_of_bounds',
    });
  });

  it('rejects an outcome that contradicts the score', () => {
    expect(validateResult(goals, 'win', { self: 0, opponent: 2 })).toEqual({
      ok: false,
      error: 'outcome_score_mismatch',
    });
    expect(validateResult(goals, 'loss', { self: 3, opponent: 2 })).toEqual({
      ok: false,
      error: 'outcome_score_mismatch',
    });
    // Placement: lower is better, so placing 5th against 2nd cannot be a win.
    expect(validateResult(placement, 'win', { self: 5, opponent: 2 })).toEqual({
      ok: false,
      error: 'outcome_score_mismatch',
    });
    expect(validateResult(placement, 'win', { self: 2, opponent: 5 })).toEqual({ ok: true });
  });

  it('lets an equal score stand as submitted (tiebreak rule)', () => {
    expect(validateResult(goals, 'win', { self: 1, opponent: 1 })).toEqual({ ok: true });
    expect(validateResult(goals, 'loss', { self: 1, opponent: 1 })).toEqual({ ok: true });
  });

  it('allows a draw only when the format allows it and the score is level', () => {
    expect(validateResult(goals, 'draw', { self: 1, opponent: 1 })).toEqual({
      ok: false,
      error: 'draw_not_allowed',
    });
    expect(validateResult(goalsWithDraw, 'draw', { self: 1, opponent: 1 })).toEqual({ ok: true });
    expect(validateResult(goalsWithDraw, 'draw', { self: 2, opponent: 1 })).toEqual({
      ok: false,
      error: 'outcome_score_mismatch',
    });
  });
});

describe('compareScore', () => {
  it('treats higher as better except for placement', () => {
    expect(compareScore('goals', { self: 3, opponent: 1 })).toBe(1);
    expect(compareScore('kills', { self: 1, opponent: 3 })).toBe(-1);
    expect(compareScore('placement', { self: 1, opponent: 3 })).toBe(1);
    expect(compareScore('points', { self: 7, opponent: 7 })).toBe(0);
  });
});
