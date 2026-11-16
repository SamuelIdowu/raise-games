/**
 * Dispute rules (Sprint 9). Pure, unit-tested.
 *
 * Lifecycle (status on the `disputes` row, shown to both players identically):
 *   open → awaiting_info ⇄ open → reviewed → ruled → (appealed → final)
 * - open: just opened (by a player, or automatically when results conflict).
 * - awaiting_info: a moderator asked for more evidence (Sprint 12 tooling sets it).
 * - reviewed: a moderator has looked at everything and is deciding.
 * - ruled: first ruling recorded; either player may appeal once.
 * - appealed: the one appeal is in; goes back to the queue.
 * - final: ruling on the appeal (round 2). Nothing further.
 * A ruling that voids the match is final immediately (a voided match is terminal).
 */

export const DISPUTE_CATEGORIES = [
  'wrong_score',
  'wrong_winner',
  'opponent_cheated',
  'no_show',
  'disconnect',
  'other',
] as const;
export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];

export const DISPUTE_STATUSES = [
  'open',
  'awaiting_info',
  'reviewed',
  'ruled',
  'appealed',
  'final',
] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const RULING_OUTCOMES = ['side0_win', 'side1_win', 'draw', 'void'] as const;
export type RulingOutcome = (typeof RULING_OUTCOMES)[number];

/** Evidence items one player may add to one dispute. */
export const MAX_EVIDENCE_PER_PLAYER = 3;
export const DETAIL_MAX = 1000;
export const APPEAL_REASON_MAX = 1000;

/** Players can add evidence while a moderator has not ruled yet (or during the appeal). */
export function acceptsEvidence(status: DisputeStatus): boolean {
  return status === 'open' || status === 'awaiting_info' || status === 'appealed';
}

/** Statuses a moderator can rule from, and which round that ruling is. */
export function rulingRoundFor(status: DisputeStatus): 1 | 2 | null {
  if (status === 'open' || status === 'awaiting_info' || status === 'reviewed') return 1;
  if (status === 'appealed') return 2;
  return null;
}

export type AppealBlock = 'not_ruled' | 'already_appealed' | 'final' | 'void_is_final' | null;

/** Why an appeal is not possible right now (null = allowed). One appeal per dispute (PRD). */
export function appealBlock(input: {
  status: DisputeStatus;
  lastOutcome: RulingOutcome | null;
  hasAppeal: boolean;
}): AppealBlock {
  if (input.hasAppeal) return 'already_appealed';
  if (input.status === 'final') return input.lastOutcome === 'void' ? 'void_is_final' : 'final';
  if (input.status !== 'ruled') return 'not_ruled';
  if (input.lastOutcome === 'void') return 'void_is_final';
  return null;
}

export const APPEAL_BLOCK_COPY: Record<Exclude<AppealBlock, null>, string> = {
  not_ruled: 'You can appeal once a moderator has ruled.',
  already_appealed: 'This dispute has already been appealed. Each dispute can be appealed once.',
  final: 'The ruling on the appeal is final.',
  void_is_final: 'A voided match cannot be appealed.',
};

export function winnerSideOf(outcome: RulingOutcome): number | null {
  if (outcome === 'side0_win') return 0;
  if (outcome === 'side1_win') return 1;
  return null;
}

/**
 * What ratings (Sprint 10) and holds (Sprint 13) must do with a ruling.
 * - apply: first effective result for this match.
 * - reverse_and_apply: an appeal changed a previously applied result.
 * - reverse: an appeal voided a previously applied result.
 * - none: nothing to (re)apply.
 */
export type RatingAction = 'apply' | 'reverse_and_apply' | 'reverse' | 'none';

export function ratingActionFor(
  round: 1 | 2,
  outcome: RulingOutcome,
  previous: RulingOutcome | null,
): RatingAction {
  if (round === 1) return outcome === 'void' ? 'none' : 'apply';
  if (previous === outcome) return 'none';
  if (outcome === 'void') return 'reverse';
  return 'reverse_and_apply';
}

/** Tracker steps for the shared stepper (UX Flow 6: both sides see the same status). */
export type TrackerStep = {
  key: 'opened' | 'review' | 'ruled' | 'appeal' | 'final';
  label: string;
  state: 'done' | 'current' | 'upcoming';
};

export function trackerSteps(status: DisputeStatus, hasAppeal: boolean): TrackerStep[] {
  const appealed = hasAppeal || status === 'appealed';
  const keys: Array<TrackerStep['key']> = appealed
    ? ['opened', 'review', 'ruled', 'appeal', 'final']
    : ['opened', 'review', 'ruled'];
  const labels: Record<TrackerStep['key'], string> = {
    opened: 'Opened',
    review: status === 'awaiting_info' ? 'More information requested' : 'Under review',
    ruled: 'Ruled',
    appeal: 'Appealed',
    final: 'Final ruling',
  };
  // Index of the step in progress; keys.length means every step is done.
  const current =
    status === 'appealed' ? 3 : status === 'ruled' || status === 'final' ? keys.length : 1;
  return keys.map((key, i) => ({
    key,
    label: labels[key],
    state: i < current ? 'done' : i === current ? 'current' : 'upcoming',
  }));
}
