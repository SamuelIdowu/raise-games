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

/**
 * Legal match transitions (Sprint 6, F6.1). Mirrored by the DB trigger in migration
 * 0005_state_guards, so a raw UPDATE cannot skip a step either. Keep both in sync; the
 * integration suite checks every illegal pair against the database.
 *
 * - accepted → in_progress happens at the agreed start (time-driven, per game config).
 * - A first result submission moves any live state to awaiting_confirmation (Sprint 8).
 * - forfeited comes from a no-show decision; voided is admin-only and may correct a
 *   finished match.
 */
export const MATCH_TRANSITIONS: Readonly<Record<MatchState, readonly MatchState[]>> = {
  open: ['accepted', 'cancelled', 'expired'],
  accepted: [
    'in_progress',
    'awaiting_result',
    'awaiting_confirmation',
    'cancelled',
    'expired',
    'forfeited',
    'voided',
  ],
  in_progress: ['awaiting_result', 'awaiting_confirmation', 'cancelled', 'forfeited', 'voided'],
  awaiting_result: ['awaiting_confirmation', 'expired', 'forfeited', 'voided'],
  awaiting_confirmation: ['confirmed', 'disputed', 'forfeited', 'voided'],
  disputed: ['resolved', 'voided'],
  confirmed: ['voided'],
  resolved: ['voided'],
  forfeited: ['voided'],
  cancelled: [],
  expired: [],
  voided: [],
};

export function canTransitionMatch(from: MatchState, to: MatchState): boolean {
  return MATCH_TRANSITIONS[from].includes(to);
}

/**
 * Challenge lifecycle. A challenge only decides whether a match exists; everything after
 * acceptance lives on the match. Late cancel (accepted → cancelled) costs reputation.
 */
export const CHALLENGE_STATES = ['open', 'accepted', 'cancelled', 'expired'] as const;
export type ChallengeState = (typeof CHALLENGE_STATES)[number];

export const CHALLENGE_TRANSITIONS: Readonly<Record<ChallengeState, readonly ChallengeState[]>> = {
  open: ['accepted', 'cancelled', 'expired'],
  accepted: ['cancelled'],
  cancelled: [],
  expired: [],
};

export function canTransitionChallenge(from: string, to: string): boolean {
  return (CHALLENGE_TRANSITIONS as Record<string, readonly string[]>)[from]?.includes(to) ?? false;
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
