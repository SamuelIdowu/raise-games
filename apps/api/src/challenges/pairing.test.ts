import { describe, expect, it } from 'vitest';
import { canonicalPair, ratingGapBetween } from './pairing';

describe('pairing fairness helpers', () => {
  it('orders a pair canonically regardless of call order', () => {
    const a = canonicalPair('user-a', 'user-b');
    const b = canonicalPair('user-b', 'user-a');
    expect(a).toEqual({ userAId: 'user-a', userBId: 'user-b' });
    expect(b).toEqual(a);
  });

  it('computes an absolute rating gap', () => {
    expect(ratingGapBetween(1250, 1000)).toBe(250);
    expect(ratingGapBetween(1000, 1250)).toBe(250);
    expect(ratingGapBetween(1000, 1000)).toBe(0);
  });
});
