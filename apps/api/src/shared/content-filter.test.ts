import { describe, expect, it } from 'vitest';
import { containsBlockedTerm } from './content-filter';

describe('containsBlockedTerm', () => {
  it('flags blocklisted words, including common character swaps', () => {
    expect(containsBlockedTerm('you are a mumu')).toBe(true);
    expect(containsBlockedTerm('SH1T game')).toBe(true);
    expect(containsBlockedTerm('f*ck')).toBe(false);
    expect(containsBlockedTerm('werey')).toBe(true);
  });

  it('does not flag ordinary words that contain a blocked substring', () => {
    expect(containsBlockedTerm('GG, close match!')).toBe(false);
    expect(containsBlockedTerm('Scunthorpe')).toBe(false);
    expect(containsBlockedTerm('an ode to the comeback')).toBe(false);
    expect(containsBlockedTerm('shitake mushrooms')).toBe(false);
  });
});
