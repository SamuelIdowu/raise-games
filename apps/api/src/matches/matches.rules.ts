import { z } from 'zod';
import type { MatchStatus } from '../chat/chat.rules';

/**
 * Deadline windows from the PRD "Rules" section. Kept as constants until the rules
 * config (per game/format) grows these fields; the summary copy reads them from here.
 */
export const RESULT_SUBMISSION_WINDOW_MS = 24 * 60 * 60 * 1000; // within 24h of agreed start
export const CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000; // opponent has 24h, then auto-confirm
/** Alias used by the Sprint 8 result code. */
export const RESULT_WINDOW_MS = RESULT_SUBMISSION_WINDOW_MS;
/** A no-show can be reported 20 minutes after the agreed start (PRD). */
export const NO_SHOW_GATE_MS = 20 * 60 * 1000;

/** Shape of game_formats JSONB columns (seeded from packages/game-configs). */
export const resultSchemaColumn = z.object({
  outcomeOptions: z.array(z.enum(['win', 'loss', 'draw'])).min(1),
  scoreModel: z.enum(['goals', 'kills', 'placement', 'points']),
  drawAllowed: z.boolean(),
});
export const requiredProofColumn = z.array(z.enum(['screenshot', 'score', 'none'])).min(1);
export type RequiredProof = z.infer<typeof requiredProofColumn>;

export type DeadlineKind = 'submit_result' | 'confirm_result';

export interface Deadline {
  kind: DeadlineKind;
  at: Date;
}

/** The one deadline the hub counts down to in the current state, if any. */
export function currentDeadline(input: {
  status: MatchStatus;
  startsAt: Date;
  resultSubmittedAt: Date | null;
}): Deadline | null {
  switch (input.status) {
    case 'accepted':
    case 'in_progress':
    case 'awaiting_result':
      return {
        kind: 'submit_result',
        at: new Date(input.startsAt.getTime() + RESULT_SUBMISSION_WINDOW_MS),
      };
    case 'awaiting_confirmation':
      return input.resultSubmittedAt
        ? {
            kind: 'confirm_result',
            at: new Date(input.resultSubmittedAt.getTime() + CONFIRMATION_WINDOW_MS),
          }
        : null;
    default:
      return null;
  }
}

/**
 * The deadline the hub counts down to, from the row values Sprint 8 stores
 * (result_deadline, confirmation_deadline), falling back to the PRD windows for rows
 * written before those columns existed.
 */
export function deadlineFromRow(input: {
  status: MatchStatus;
  startsAt: Date;
  resultSubmittedAt: Date | null;
  resultDeadline: Date | null;
  confirmationDeadline: Date | null;
}): Deadline | null {
  if (input.status === 'awaiting_confirmation') {
    if (input.confirmationDeadline)
      return { kind: 'confirm_result', at: input.confirmationDeadline };
  } else if (
    input.resultDeadline &&
    ['accepted', 'in_progress', 'awaiting_result'].includes(input.status)
  ) {
    return { kind: 'submit_result', at: input.resultDeadline };
  }
  return currentDeadline(input);
}

export type NextAction =
  | 'wait_for_start'
  | 'submit_result'
  | 'confirm_or_submit'
  | 'waiting_for_opponent'
  | 'disputed'
  | 'done'
  | 'closed';

const SUBMITTABLE: readonly MatchStatus[] = [
  'accepted',
  'in_progress',
  'awaiting_result',
  'awaiting_confirmation',
];

/** What the viewer should do next (Sprint 8 spec §4); drives the hub's primary action. */
export function nextActionFor(input: {
  status: MatchStatus;
  isParticipant: boolean;
  iSubmitted: boolean;
  opponentSubmitted: boolean;
  startsAt: Date;
  resultDeadline: Date;
  now: Date;
}): NextAction {
  if (input.status === 'disputed') return 'disputed';
  if (input.status === 'confirmed' || input.status === 'forfeited' || input.status === 'resolved')
    return 'done';
  if (!input.isParticipant || !SUBMITTABLE.includes(input.status)) return 'closed';
  if (input.iSubmitted) return 'waiting_for_opponent';
  if (input.opponentSubmitted) return 'confirm_or_submit';
  if (input.now < input.startsAt) return 'wait_for_start';
  if (input.now > input.resultDeadline) return 'closed';
  return 'submit_result';
}
