/**
 * PRD "Stage 1 success metrics (first 8 weeks after launch)", Sprint 16 (F16.2). Pure.
 *
 * Count targets are 8-week launch targets: during the beta they are judged against the
 * pace for the weeks elapsed (target × weeks ÷ 8). The beta is far smaller than launch, so
 * counts will read "behind" by design; the rates are the beta's real signal. The PRD says
 * to revisit these targets after the closed beta.
 */

export type MetricKey =
  | 'registered'
  | 'challengeShare'
  | 'completedMatches'
  | 'autoConfirmShare'
  | 'disputeRate'
  | 'medianResolutionHours'
  | 'week4Retention';

export interface MetricTarget {
  label: string;
  /** count: at least `target` by week 8; min: rate at least; max: rate or hours at most. */
  kind: 'count' | 'min' | 'max';
  target: number;
  unit: 'players' | 'matches' | 'share' | 'hours';
  /** The PRD wording, shown next to the number. */
  prd: string;
}

export const PRD_TARGETS: Record<MetricKey, MetricTarget> = {
  registered: {
    label: 'Players with a game ID',
    kind: 'count',
    target: 1000,
    unit: 'players',
    prd: '1,000 registered players with at least one game ID',
  },
  challengeShare: {
    label: 'Created or accepted a challenge',
    kind: 'min',
    target: 0.35,
    unit: 'share',
    prd: '35% of registered players create or accept a challenge',
  },
  completedMatches: {
    label: 'Completed matches, verified',
    kind: 'count',
    target: 1500,
    unit: 'matches',
    prd: '1,500 completed matches with verified results',
  },
  autoConfirmShare: {
    label: 'Auto-confirmed, no admin action',
    kind: 'min',
    target: 0.8,
    unit: 'share',
    prd: '80% or more of matches auto-confirmed with no admin action',
  },
  disputeRate: {
    label: 'Dispute rate',
    kind: 'max',
    target: 0.1,
    unit: 'share',
    prd: 'Dispute rate under 10%',
  },
  medianResolutionHours: {
    label: 'Median dispute resolution',
    kind: 'max',
    target: 24,
    unit: 'hours',
    prd: 'Median resolution under 24 hours',
  },
  week4Retention: {
    label: 'Still active in week 4',
    kind: 'min',
    target: 0.25,
    unit: 'share',
    prd: '25% of players who finish a match still active in week 4',
  },
};

export type TrackStatus = 'on_track' | 'behind' | 'no_data';

export function onTrack(key: MetricKey, value: number | null, weeksElapsed: number): TrackStatus {
  if (value === null || Number.isNaN(value)) return 'no_data';
  const t = PRD_TARGETS[key];
  if (t.kind === 'count') {
    const pace = (t.target * Math.min(8, Math.max(0, weeksElapsed))) / 8;
    return value >= pace ? 'on_track' : 'behind';
  }
  if (t.kind === 'min') return value >= t.target ? 'on_track' : 'behind';
  // max: the dispute rate is "under 10%", the median "under 24 hours": strictly below.
  return value < t.target ? 'on_track' : 'behind';
}
