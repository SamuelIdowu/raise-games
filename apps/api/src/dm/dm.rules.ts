/**
 * Restricted DM rules (Sprint 14, F14.2; TA §Messaging: "DMs only between players who
 * completed a match together or accepted a friend request"). Pure, no I/O.
 *
 * Eligibility matrix (blocks win over everything):
 *
 *   blocked either way          → no DM, no friend request, no new conversation
 *   accepted friends            → DM
 *   completed a match together  → DM   (confirmed or resolved: a real result exists)
 *   anything else               → no DM (a friend request from the profile is the path)
 *
 * A forfeit, void, cancel or expiry is not "completed": nobody played, so it does not open
 * a channel between strangers.
 */

export const DM_FLAG_KEY = 'messaging.dm';

/** Match states that count as "completed a match together". */
export const COMPLETED_MATCH_STATES = ['confirmed', 'resolved'] as const;

/** A declined requester waits this long before asking the same player again. */
export const FRIEND_REASK_COOLDOWN_MS = 30 * 24 * 3600_000;
/** Pending outgoing requests one player may hold at once. */
export const MAX_PENDING_OUTGOING = 20;

/**
 * Per-pair send limits, on top of the per-user match-chat limits. The unanswered cap stops
 * one-sided floods: after this many messages in a row with no reply, wait for one.
 */
export const DM_PAIR_LIMITS = [
  { name: 'burst', max: 5, windowMs: 10_000 },
  { name: 'hour', max: 60, windowMs: 3_600_000 },
] as const;
export const DM_MAX_UNANSWERED = 5;

export type IneligibleReason = 'self' | 'blocked' | 'not_connected';

export interface PairFacts {
  self: boolean;
  /** Either player blocked the other. */
  blocked: boolean;
  friends: boolean;
  completedMatch: boolean;
}

export type Eligibility =
  { ok: true; via: 'friends' | 'match' } | { ok: false; reason: IneligibleReason };

export function dmEligibility(f: PairFacts): Eligibility {
  if (f.self) return { ok: false, reason: 'self' };
  if (f.blocked) return { ok: false, reason: 'blocked' };
  if (f.friends) return { ok: true, via: 'friends' };
  if (f.completedMatch) return { ok: true, via: 'match' };
  return { ok: false, reason: 'not_connected' };
}

/**
 * Player-facing copy. Deliberately the same for "blocked" and "not connected": a blocked
 * player is never told they were blocked (Design §9 neutral copy).
 */
export const DM_COPY = {
  cannotMessage: 'You can message players you have finished a match with or added as friends.',
  cannotSend: 'You can’t send messages in this conversation.',
  cannotRequest: 'You can’t send a friend request to this player right now.',
  unanswered: 'Wait for a reply before sending more messages.',
  tooFast: 'You are sending messages too fast',
  /** A sanction that stops play (suspension, ban) also pauses DMs and friend requests. */
  suspended: 'Messaging is paused on your account while a suspension is active.',
} as const;

/** Canonical pair key: the two ids sorted, so (a, b) and (b, a) are one conversation. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function otherOf(key: string, me: string): string {
  const [a, b] = key.split(':');
  return a === me ? b! : a!;
}

export type FriendStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'removed';
export type FriendAction = 'accept' | 'decline' | 'cancel' | 'remove';

/**
 * Friend request transitions. `actorIsAddressee` says which side acts: only the addressee
 * accepts or declines, only the requester cancels, and either friend can remove.
 */
export function nextFriendStatus(
  status: FriendStatus,
  action: FriendAction,
  actorIsAddressee: boolean,
): FriendStatus | null {
  if (status === 'pending') {
    if (action === 'accept' && actorIsAddressee) return 'accepted';
    if (action === 'decline' && actorIsAddressee) return 'declined';
    if (action === 'cancel' && !actorIsAddressee) return 'cancelled';
    return null;
  }
  if (status === 'accepted' && action === 'remove') return 'removed';
  return null;
}

export interface PriorRequest {
  requesterId: string;
  status: FriendStatus;
  respondedAt: Date | null;
}

/**
 * May `me` send a new request, given the pair's history? A live row (pending/accepted)
 * blocks a duplicate. A decline of *my* request starts a cooldown; the other player may
 * still ask me at any time (declining is not a block).
 */
export function canRequestAgain(
  history: PriorRequest[],
  me: string,
  now: number,
): { ok: true } | { ok: false; reason: 'pending' | 'friends' | 'cooldown' } {
  for (const r of history) {
    if (r.status === 'pending') return { ok: false, reason: 'pending' };
    if (r.status === 'accepted') return { ok: false, reason: 'friends' };
  }
  const lastDecline = history
    .filter((r) => r.status === 'declined' && r.requesterId === me && r.respondedAt)
    .map((r) => r.respondedAt!.getTime())
    .sort((a, b) => b - a)[0];
  if (lastDecline !== undefined && now - lastDecline < FRIEND_REASK_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown' };
  }
  return { ok: true };
}

/** True when the last `DM_MAX_UNANSWERED` messages are all from `me` (system rows ignored). */
export function overUnansweredCap(recentSenders: Array<string | null>, me: string): boolean {
  const users = recentSenders.filter((s): s is string => s !== null);
  if (users.length < DM_MAX_UNANSWERED) return false;
  return users.slice(0, DM_MAX_UNANSWERED).every((s) => s === me);
}
