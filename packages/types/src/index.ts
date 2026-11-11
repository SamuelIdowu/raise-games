export const MATCH_STATES = [
  'open',
  'accepted',
  'in_progress',
  'awaiting_result',
  'awaiting_confirmation',
  'confirmed',
  'disputed',
  'resolved',
  'cancelled',
  'expired',
  'forfeited',
  'voided',
] as const;

export type MatchState = (typeof MATCH_STATES)[number];

const TERMINAL: readonly MatchState[] = [
  'confirmed',
  'resolved',
  'cancelled',
  'expired',
  'forfeited',
  'voided',
];

export function isTerminal(state: MatchState): boolean {
  return TERMINAL.includes(state);
}

export const ROLES = ['player', 'moderator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const IDENTITY_TIERS = [
  'tier0_unverified',
  'tier1_phone_verified',
  'tier2_kyc',
  'tier3_kyc_plus',
] as const;
export type IdentityTier = (typeof IDENTITY_TIERS)[number];

export const SANCTION_STEPS = [
  'none',
  'warning',
  'suspension_7d',
  'suspension_30d',
  'permanent_ban',
] as const;
export type SanctionStep = (typeof SANCTION_STEPS)[number];

export const REPUTATION_BADGES = ['new', 'low', 'reliable', 'trusted'] as const;
export type ReputationBadge = (typeof REPUTATION_BADGES)[number];

export const RANK_TIERS = ['rookie', 'challenger', 'contender', 'elite', 'champion'] as const;
export type RankTier = (typeof RANK_TIERS)[number];

export const OUTCOMES = ['won', 'lost', 'draw', 'no_show'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface StakeField {
  amountMinor: number;
  currency: string;
  feeScheduleVersion: number;
}
