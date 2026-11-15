/**
 * Pure match-chat rules (Sprint 7, F7.3). No I/O, so they are unit-tested directly.
 *
 * Lock rule (PRD "Rules": "Match chat locks 72 hours after completion and is retained
 * through the dispute window"). "Completion" is the moment the match reaches a final
 * outcome — a terminal state of the shared status model (TA "Match state machine"):
 *
 *   confirmed  → confirmedAt   (both agreed, or auto-confirmed after the 24h window)
 *   resolved   → resolvedAt    (a moderator ruled on a dispute)
 *   forfeited  → forfeitedAt   (no-show decision)
 *   voided     → voidedAt
 *   cancelled  → cancelledAt
 *   expired    → expiredAt
 *
 * A `disputed` match is NOT complete: the clock only starts at `resolved`, so the chat
 * stays open (and is evidence) for the whole dispute. Every non-terminal state keeps the
 * chat open. Locking never deletes messages; retention is a separate owner decision.
 */

export const CHAT_MAX_CHARS = 500;
export const CHAT_LOCK_AFTER_MS = 72 * 60 * 60 * 1000;

export type MatchStatus =
  | 'open'
  | 'accepted'
  | 'in_progress'
  | 'awaiting_result'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'disputed'
  | 'resolved'
  | 'cancelled'
  | 'expired'
  | 'forfeited'
  | 'voided';

export interface MatchTimestamps {
  status: MatchStatus;
  confirmedAt: Date | null;
  resolvedAt: Date | null;
  forfeitedAt: Date | null;
  voidedAt: Date | null;
  cancelledAt: Date | null;
  expiredAt: Date | null;
  updatedAt: Date;
}

const TERMINAL_TIMESTAMP: Partial<Record<MatchStatus, keyof MatchTimestamps>> = {
  confirmed: 'confirmedAt',
  resolved: 'resolvedAt',
  forfeited: 'forfeitedAt',
  voided: 'voidedAt',
  cancelled: 'cancelledAt',
  expired: 'expiredAt',
};

export function isTerminal(status: MatchStatus): boolean {
  return status in TERMINAL_TIMESTAMP;
}

/** When the match reached its final outcome, or null while it is still live. */
export function completedAt(match: MatchTimestamps): Date | null {
  const key = TERMINAL_TIMESTAMP[match.status];
  if (!key) return null;
  const value = match[key];
  // A terminal row missing its timestamp is a data bug elsewhere; fall back to the last
  // write so the chat still locks rather than staying open forever.
  return value instanceof Date ? value : match.updatedAt;
}

/** When the chat locks, or null while the match is still live. */
export function chatLocksAt(match: MatchTimestamps): Date | null {
  const done = completedAt(match);
  return done ? new Date(done.getTime() + CHAT_LOCK_AFTER_MS) : null;
}

export function isChatLocked(match: MatchTimestamps, now: Date = new Date()): boolean {
  const locksAt = chatLocksAt(match);
  return locksAt !== null && now.getTime() >= locksAt.getTime();
}

export type BodyValidation =
  { ok: true; body: string } | { ok: false; reason: 'empty' | 'too_long' };

/**
 * Normalises and validates a message body. Length counts user-perceived characters
 * (code points), so an emoji counts once. Over-limit messages are rejected, not
 * truncated: silently cutting a player's message changes what they said, and the
 * composer already enforces the limit.
 */
export function validateBody(raw: string): BodyValidation {
  // Strip control chars except newline/tab, normalise line endings, trim.
  const body = raw
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (body.length === 0) return { ok: false, reason: 'empty' };
  if ([...body].length > CHAT_MAX_CHARS) return { ok: false, reason: 'too_long' };
  return { ok: true, body };
}

/**
 * Room codes are visible only to the two participants, and only once the match exists
 * in an accepted-or-later live state (F6.5 / F7.2). After a terminal outcome the code
 * is no longer useful and is hidden again.
 */
export function canSeeRoomCode(isParticipant: boolean, status: MatchStatus): boolean {
  if (!isParticipant) return false;
  return status !== 'open' && !isTerminal(status);
}
