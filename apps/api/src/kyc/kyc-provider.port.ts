/**
 * KYC provider port (audit B31; TA "Identity tiers and a KYC provider port", Delivery Plan M3).
 *
 * Stage 1 verifies phones only and never starts a KYC check. Stage 2 picks a provider (owner
 * and legal decision) and implements this interface; the provider's verified callback is then
 * turned into a `KycResult` and applied by `KycService.applyResult`, which moves the player's
 * identity tier and therefore their stake caps (`stake_limit_rules`, Sprint 13).
 */
export interface KycProviderPort {
  readonly name: string;
  /**
   * Start a verification for a player. Returns the provider's session reference and, for
   * hosted flows, the URL the player opens. Idempotent on `key`.
   */
  start(input: { key: string; userId: string; level: KycLevel }): Promise<KycSession>;
}

/** tier2: government ID plus selfie. tier3: tier2 plus proof of address or enhanced checks. */
export type KycLevel = 'tier2' | 'tier3';

export interface KycSession {
  reference: string;
  url: string | null;
}

/** A provider's final answer, after its callback signature has been verified. */
export interface KycResult {
  provider: string;
  reference: string;
  userId: string;
  level: KycLevel;
  outcome: 'verified' | 'rejected';
  /** Whether the check proved the player is at or above the minimum age (legal track). */
  ageVerified: boolean | null;
}
