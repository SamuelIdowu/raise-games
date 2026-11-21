import { describe, expect, it } from 'vitest';
import { nextIdentityState, type IdentityState } from './kyc.rules';
import type { KycResult } from './kyc-provider.port';

const phoneOnly: IdentityState = {
  tier: 'tier1_phone_verified',
  kycStatus: 'none',
  ageStatus: 'pending',
};

function result(overrides: Partial<KycResult>): KycResult {
  return {
    provider: 'mock',
    reference: 'ref',
    userId: 'u1',
    level: 'tier2',
    outcome: 'verified',
    ageVerified: true,
    ...overrides,
  };
}

describe('nextIdentityState (KYC result → identity tier)', () => {
  it('a verified tier2 check raises a phone-verified player to tier2 and records age', () => {
    expect(nextIdentityState(phoneOnly, result({}))).toEqual({
      tier: 'tier2_kyc',
      kycStatus: 'verified',
      ageStatus: 'verified',
    });
  });

  it('never lowers a higher tier', () => {
    const tier3: IdentityState = {
      tier: 'tier3_kyc_plus',
      kycStatus: 'verified',
      ageStatus: 'verified',
    };
    expect(nextIdentityState(tier3, result({ level: 'tier2' })).tier).toBe('tier3_kyc_plus');
  });

  it('a rejection keeps the tier (not a sanction) but records the status', () => {
    expect(
      nextIdentityState(phoneOnly, result({ outcome: 'rejected', ageVerified: null })),
    ).toEqual({
      tier: 'tier1_phone_verified',
      kycStatus: 'rejected',
      ageStatus: 'pending',
    });
  });

  it('records a failed age check', () => {
    expect(nextIdentityState(phoneOnly, result({ ageVerified: false })).ageStatus).toBe('rejected');
  });
});
