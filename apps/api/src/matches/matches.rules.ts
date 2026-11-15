import type { MatchStatus } from '../chat/chat.rules';

/**
 * Deadline windows from the PRD "Rules" section. Kept as constants until the rules
 * config (per game/format) grows these fields; the summary copy reads them from here.
 */
export const RESULT_SUBMISSION_WINDOW_MS = 24 * 60 * 60 * 1000; // within 24h of agreed start
export const CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000; // opponent has 24h, then auto-confirm

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
