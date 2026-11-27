import { describe, expect, it } from 'vitest';
import {
  DM_MAX_UNANSWERED,
  FRIEND_REASK_COOLDOWN_MS,
  canRequestAgain,
  dmEligibility,
  nextFriendStatus,
  otherOf,
  overUnansweredCap,
  pairKey,
} from './dm.rules';

const base = { self: false, blocked: false, friends: false, completedMatch: false };

describe('dmEligibility (F14.2 matrix)', () => {
  it('strangers cannot DM', () => {
    expect(dmEligibility(base)).toEqual({ ok: false, reason: 'not_connected' });
  });
  it('friends and completed-match pairs can', () => {
    expect(dmEligibility({ ...base, friends: true })).toEqual({ ok: true, via: 'friends' });
    expect(dmEligibility({ ...base, completedMatch: true })).toEqual({ ok: true, via: 'match' });
  });
  it('a block beats friendship and match history', () => {
    expect(dmEligibility({ ...base, friends: true, completedMatch: true, blocked: true })).toEqual({
      ok: false,
      reason: 'blocked',
    });
  });
  it('nobody DMs themselves', () => {
    expect(dmEligibility({ ...base, self: true, friends: true })).toEqual({
      ok: false,
      reason: 'self',
    });
  });
});

describe('pairKey', () => {
  it('is order independent and reversible', () => {
    expect(pairKey('b', 'a')).toBe('a:b');
    expect(pairKey('a', 'b')).toBe('a:b');
    expect(otherOf('a:b', 'a')).toBe('b');
    expect(otherOf('a:b', 'b')).toBe('a');
  });
});

describe('nextFriendStatus', () => {
  it('only the addressee accepts or declines; only the requester cancels', () => {
    expect(nextFriendStatus('pending', 'accept', true)).toBe('accepted');
    expect(nextFriendStatus('pending', 'accept', false)).toBeNull();
    expect(nextFriendStatus('pending', 'decline', true)).toBe('declined');
    expect(nextFriendStatus('pending', 'decline', false)).toBeNull();
    expect(nextFriendStatus('pending', 'cancel', false)).toBe('cancelled');
    expect(nextFriendStatus('pending', 'cancel', true)).toBeNull();
  });
  it('friends can be removed by either side; settled rows are final', () => {
    expect(nextFriendStatus('accepted', 'remove', true)).toBe('removed');
    expect(nextFriendStatus('accepted', 'remove', false)).toBe('removed');
    expect(nextFriendStatus('declined', 'accept', true)).toBeNull();
    expect(nextFriendStatus('removed', 'remove', true)).toBeNull();
  });
});

describe('canRequestAgain', () => {
  const now = Date.UTC(2026, 10, 17);
  it('blocks duplicates while pending or friends', () => {
    expect(
      canRequestAgain([{ requesterId: 'x', status: 'pending', respondedAt: null }], 'me', now),
    ).toEqual({ ok: false, reason: 'pending' });
    expect(
      canRequestAgain([{ requesterId: 'me', status: 'accepted', respondedAt: null }], 'me', now),
    ).toEqual({ ok: false, reason: 'friends' });
  });
  it('a decline of my request starts a cooldown for me only', () => {
    const declined = { status: 'declined' as const, respondedAt: new Date(now - 86_400_000) };
    expect(canRequestAgain([{ ...declined, requesterId: 'me' }], 'me', now)).toEqual({
      ok: false,
      reason: 'cooldown',
    });
    // The player who declined can still ask me.
    expect(canRequestAgain([{ ...declined, requesterId: 'me' }], 'them', now)).toEqual({
      ok: true,
    });
  });
  it('the cooldown ends', () => {
    const old = new Date(now - FRIEND_REASK_COOLDOWN_MS - 1);
    expect(
      canRequestAgain([{ requesterId: 'me', status: 'declined', respondedAt: old }], 'me', now),
    ).toEqual({ ok: true });
  });
});

describe('overUnansweredCap', () => {
  it('trips only after the cap of consecutive unanswered messages', () => {
    const mine = Array<string>(DM_MAX_UNANSWERED).fill('me');
    expect(overUnansweredCap(mine, 'me')).toBe(true);
    expect(overUnansweredCap(mine.slice(1), 'me')).toBe(false);
    expect(overUnansweredCap(['me', 'them', ...mine], 'me')).toBe(false);
    // System messages do not count as replies or as sends.
    expect(overUnansweredCap([null, ...mine], 'me')).toBe(true);
  });
});
