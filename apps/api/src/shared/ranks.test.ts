import { describe, expect, it } from 'vitest';
import { rankTierForRating, rankTierLabel, rankTierRange } from './ranks';

describe('ranks', () => {
  it('maps rating boundaries to default tier names', () => {
    expect(rankTierForRating(0)).toBe('rookie');
    expect(rankTierForRating(999)).toBe('rookie');
    expect(rankTierForRating(1000)).toBe('challenger');
    expect(rankTierForRating(1149)).toBe('challenger');
    expect(rankTierForRating(1150)).toBe('contender');
    expect(rankTierForRating(1299)).toBe('contender');
    expect(rankTierForRating(1300)).toBe('elite');
    expect(rankTierForRating(1449)).toBe('elite');
    expect(rankTierForRating(1450)).toBe('champion');
    expect(rankTierForRating(9999)).toBe('champion');
  });

  it('labels every tier', () => {
    expect(rankTierLabel('rookie')).toBe('Rookie');
    expect(rankTierLabel('challenger')).toBe('Challenger');
    expect(rankTierLabel('contender')).toBe('Contender');
    expect(rankTierLabel('elite')).toBe('Elite');
    expect(rankTierLabel('champion')).toBe('Champion');
  });

  it('returns inclusive rating ranges, with no cap at champion', () => {
    expect(rankTierRange('rookie')).toEqual({ min: 0, max: 999 });
    expect(rankTierRange('challenger')).toEqual({ min: 1000, max: 1149 });
    expect(rankTierRange('contender')).toEqual({ min: 1150, max: 1299 });
    expect(rankTierRange('elite')).toEqual({ min: 1300, max: 1449 });
    expect(rankTierRange('champion')).toEqual({ min: 1450, max: null });
  });
});
