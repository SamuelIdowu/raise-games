import type { KycResult } from './kyc-provider.port';

export type IdentityTier =
  'tier0_unverified' | 'tier1_phone_verified' | 'tier2_kyc' | 'tier3_kyc_plus';
export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected';
export type AgeStatus = 'pending' | 'verified' | 'rejected';

export interface IdentityState {
  tier: IdentityTier;
  kycStatus: KycStatus;
  ageStatus: AgeStatus;
}

const RANK: Record<IdentityTier, number> = {
  tier0_unverified: 0,
  tier1_phone_verified: 1,
  tier2_kyc: 2,
  tier3_kyc_plus: 3,
};

/**
 * The identity state after a KYC result (pure, so the rules are testable on their own).
 *
 * - Verified raises the tier to the checked level; it never lowers a higher tier (a tier2
 *   re-check does not demote a tier3 player).
 * - Rejected records the rejection but keeps the current tier: a failed upgrade is not a
 *   sanction. Moderators handle fraud separately (Sprint 12).
 * - An age answer is recorded when the provider gives one; a rejection on age is final.
 */
export function nextIdentityState(current: IdentityState, result: KycResult): IdentityState {
  const ageStatus: AgeStatus =
    result.ageVerified === null ? current.ageStatus : result.ageVerified ? 'verified' : 'rejected';
  if (result.outcome === 'rejected') {
    return { tier: current.tier, kycStatus: 'rejected', ageStatus };
  }
  const checked: IdentityTier = result.level === 'tier3' ? 'tier3_kyc_plus' : 'tier2_kyc';
  const tier = RANK[checked] > RANK[current.tier] ? checked : current.tier;
  return { tier, kycStatus: 'verified', ageStatus };
}
