/**
 * Reputation badge (Design §8: New, Low, Reliable, Trusted). Thresholds from
 * docs/decisions/0003-ux-open-decisions.md §2. Pure; ReputationService feeds it.
 */
export type ReputationLevel = 'new' | 'low' | 'reliable' | 'trusted';

/** Matches considered: the player's most recent accepted matches. */
export const REPUTATION_WINDOW = 50;
export const NEW_UNTIL_COMPLETED = 5;
export const TRUSTED_MIN_COMPLETED = 20;
export const TRUSTED_COMPLETION = 0.95;
export const TRUSTED_DISPUTES_LOST = 0.05;
export const RELIABLE_COMPLETION = 0.85;
export const RELIABLE_DISPUTES_LOST = 0.1;

export interface ReputationInput {
  /** Finished matches that count (confirmed, resolved, forfeited). */
  finished: number;
  /** Of those, matches the player completed (opponent no-shows count as completed). */
  completed: number;
  /** Disputes ruled against the player. */
  disputesLost: number;
  activeSanction: boolean;
  sanctionInLast90Days: boolean;
}

export function reputationLevel(input: ReputationInput): ReputationLevel {
  if (input.activeSanction) return 'low';
  if (input.completed < NEW_UNTIL_COMPLETED) return 'new';
  const completion = input.finished === 0 ? 1 : input.completed / input.finished;
  const lost = input.completed === 0 ? 0 : input.disputesLost / input.completed;
  if (
    input.completed >= TRUSTED_MIN_COMPLETED &&
    completion >= TRUSTED_COMPLETION &&
    lost <= TRUSTED_DISPUTES_LOST &&
    !input.sanctionInLast90Days
  ) {
    return 'trusted';
  }
  if (completion >= RELIABLE_COMPLETION && lost <= RELIABLE_DISPUTES_LOST) return 'reliable';
  return 'low';
}
