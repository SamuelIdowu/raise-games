import { describe, expect, it } from 'vitest';
import {
  CHAT_LOCK_AFTER_MS,
  CHAT_MAX_CHARS,
  canSeeRoomCode,
  chatLocksAt,
  completedAt,
  isChatLocked,
  validateBody,
  type MatchStatus,
  type MatchTimestamps,
} from './chat.rules';

const T0 = new Date('2026-11-10T12:00:00Z');

function match(status: MatchStatus, overrides: Partial<MatchTimestamps> = {}): MatchTimestamps {
  return {
    status,
    confirmedAt: null,
    resolvedAt: null,
    forfeitedAt: null,
    voidedAt: null,
    cancelledAt: null,
    expiredAt: null,
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  };
}

describe('chat lock (72h after completion)', () => {
  it.each<MatchStatus>([
    'open',
    'accepted',
    'in_progress',
    'awaiting_result',
    'awaiting_confirmation',
  ])('never locks while %s', (status) => {
    expect(chatLocksAt(match(status))).toBeNull();
    expect(isChatLocked(match(status), new Date('2030-01-01'))).toBe(false);
  });

  it('stays open for the whole dispute, even long after the confirmation window', () => {
    const disputed = match('disputed', { confirmedAt: T0 });
    expect(completedAt(disputed)).toBeNull();
    expect(isChatLocked(disputed, new Date(T0.getTime() + 30 * CHAT_LOCK_AFTER_MS))).toBe(false);
  });

  it.each<[MatchStatus, keyof MatchTimestamps]>([
    ['confirmed', 'confirmedAt'],
    ['resolved', 'resolvedAt'],
    ['forfeited', 'forfeitedAt'],
    ['voided', 'voidedAt'],
    ['cancelled', 'cancelledAt'],
    ['expired', 'expiredAt'],
  ])('%s starts the clock at %s', (status, key) => {
    const m = match(status, { [key]: T0 });
    expect(chatLocksAt(m)?.toISOString()).toBe(
      new Date(T0.getTime() + CHAT_LOCK_AFTER_MS).toISOString(),
    );
  });

  it('resolved uses resolvedAt, not the earlier confirmation that was disputed', () => {
    const resolvedAt = new Date(T0.getTime() + 5 * 24 * 3600_000);
    const m = match('resolved', { confirmedAt: T0, resolvedAt });
    expect(completedAt(m)).toEqual(resolvedAt);
  });

  it('boundary: open 1ms before 72h, locked at exactly 72h', () => {
    const m = match('confirmed', { confirmedAt: T0 });
    const lockAt = T0.getTime() + CHAT_LOCK_AFTER_MS;
    expect(isChatLocked(m, new Date(lockAt - 1))).toBe(false);
    expect(isChatLocked(m, new Date(lockAt))).toBe(true);
  });

  it('falls back to updatedAt when a terminal row is missing its timestamp', () => {
    const m = match('voided');
    expect(completedAt(m)).toEqual(m.updatedAt);
  });
});

describe('validateBody', () => {
  it('trims and normalises line endings', () => {
    expect(validateBody('  gg\r\nwp  ')).toEqual({ ok: true, body: 'gg\nwp' });
  });

  it('rejects empty and whitespace/control-only bodies', () => {
    expect(validateBody('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(validateBody('\u0000\u0007')).toEqual({ ok: false, reason: 'empty' });
  });

  it('accepts exactly 500 characters and rejects 501', () => {
    expect(validateBody('a'.repeat(CHAT_MAX_CHARS)).ok).toBe(true);
    expect(validateBody('a'.repeat(CHAT_MAX_CHARS + 1))).toEqual({ ok: false, reason: 'too_long' });
  });

  it('counts an emoji as one character', () => {
    expect(validateBody('⚽'.repeat(CHAT_MAX_CHARS)).ok).toBe(true);
  });
});

describe('room code visibility', () => {
  it('is hidden from non-participants in every state', () => {
    expect(canSeeRoomCode(false, 'in_progress')).toBe(false);
  });

  it('is hidden before acceptance and after the outcome', () => {
    expect(canSeeRoomCode(true, 'open')).toBe(false);
    expect(canSeeRoomCode(true, 'confirmed')).toBe(false);
    expect(canSeeRoomCode(true, 'cancelled')).toBe(false);
  });

  it('is visible to participants while the match is live', () => {
    for (const s of [
      'accepted',
      'in_progress',
      'awaiting_result',
      'awaiting_confirmation',
      'disputed',
    ] as const) {
      expect(canSeeRoomCode(true, s)).toBe(true);
    }
  });
});
