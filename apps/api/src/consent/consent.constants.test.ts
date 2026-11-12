import { describe, it, expect } from 'vitest';
import { CURRENT_CONSENT } from './consent.constants';

describe('consent constants', () => {
  it('exports terms and privacy versions', () => {
    expect(CURRENT_CONSENT).toEqual({ terms: '1.0', privacy: '1.0' });
  });

  it('versions are non-empty strings', () => {
    expect(typeof CURRENT_CONSENT.terms).toBe('string');
    expect(CURRENT_CONSENT.terms.length).toBeGreaterThan(0);
    expect(typeof CURRENT_CONSENT.privacy).toBe('string');
    expect(CURRENT_CONSENT.privacy.length).toBeGreaterThan(0);
  });
});
