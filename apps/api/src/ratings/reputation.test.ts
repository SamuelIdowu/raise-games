import { describe, expect, it } from 'vitest';
import { reputationLevel } from './reputation';
import { streakOf } from './ratings.service';

const base = { activeSanction: false, sanctionInLast90Days: false, disputesLost: 0 };

describe('reputationLevel (decision 0003 thresholds)', () => {
  it('is New under 5 completed matches', () => {
    expect(reputationLevel({ ...base, finished: 4, completed: 4 })).toBe('new');
  });
  it('is Trusted at 20+ completed, ≥95% completion, ≤5% disputes lost, no recent sanction', () => {
    expect(reputationLevel({ ...base, finished: 20, completed: 20 })).toBe('trusted');
    expect(reputationLevel({ ...base, finished: 21, completed: 20, disputesLost: 1 })).toBe(
      'trusted',
    );
    expect(
      reputationLevel({ ...base, finished: 20, completed: 20, sanctionInLast90Days: true }),
    ).toBe('reliable');
  });
  it('is Reliable at ≥85% completion and ≤10% disputes lost', () => {
    expect(reputationLevel({ ...base, finished: 10, completed: 9 })).toBe('reliable');
    expect(reputationLevel({ ...base, finished: 10, completed: 10, disputesLost: 1 })).toBe(
      'reliable',
    );
  });
  it('is Low below Reliable, or with any active sanction', () => {
    expect(reputationLevel({ ...base, finished: 10, completed: 8 })).toBe('low');
    expect(reputationLevel({ ...base, finished: 10, completed: 10, disputesLost: 2 })).toBe('low');
    expect(reputationLevel({ ...base, finished: 0, completed: 0, activeSanction: true })).toBe(
      'low',
    );
  });
});

describe('streakOf', () => {
  it('counts the current run, newest first', () => {
    expect(streakOf([1, 1, 0, 1])).toBe(2);
    expect(streakOf([0, 0, 0, 1])).toBe(-3);
    expect(streakOf([0.5, 1])).toBe(0);
    expect(streakOf([])).toBe(0);
  });
});
