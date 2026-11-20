import { describe, expect, it } from 'vitest';
import {
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  generateInviteCode,
  normalizeInviteCode,
} from './invites';
import { PRD_TARGETS, onTrack } from './metrics.rules';

describe('invite codes', () => {
  it('are 8 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toHaveLength(INVITE_CODE_LENGTH);
      for (const ch of code) expect(INVITE_ALPHABET).toContain(ch);
    }
    expect(INVITE_ALPHABET).not.toMatch(/[01IOL]/);
  });

  it('normalise what people type, and reject look-alikes instead of guessing', () => {
    expect(normalizeInviteCode('abcd-2345')).toBe('ABCD2345');
    expect(normalizeInviteCode(' AB CD 23 45 ')).toBe('ABCD2345');
    expect(normalizeInviteCode('ABCD234O')).toBeNull(); // letter O is not in the alphabet
    expect(normalizeInviteCode('ABCD2341')).toBeNull();
    expect(normalizeInviteCode('ABC')).toBeNull();
    expect(normalizeInviteCode('')).toBeNull();
    expect(normalizeInviteCode(undefined)).toBeNull();
  });
});

describe('metric targets (PRD Stage 1)', () => {
  it('mirror the PRD numbers', () => {
    expect(PRD_TARGETS.registered.target).toBe(1000);
    expect(PRD_TARGETS.challengeShare.target).toBe(0.35);
    expect(PRD_TARGETS.completedMatches.target).toBe(1500);
    expect(PRD_TARGETS.autoConfirmShare.target).toBe(0.8);
    expect(PRD_TARGETS.disputeRate.target).toBe(0.1);
    expect(PRD_TARGETS.medianResolutionHours.target).toBe(24);
    expect(PRD_TARGETS.week4Retention.target).toBe(0.25);
  });

  it('judge counts against the pace for the weeks elapsed', () => {
    expect(onTrack('registered', 250, 2)).toBe('on_track'); // pace 250 at week 2
    expect(onTrack('registered', 249, 2)).toBe('behind');
    expect(onTrack('completedMatches', 1500, 12)).toBe('on_track'); // capped at week 8
  });

  it('rates: "at least" for min targets, "under" for max targets', () => {
    expect(onTrack('autoConfirmShare', 0.8, 3)).toBe('on_track');
    expect(onTrack('autoConfirmShare', 0.79, 3)).toBe('behind');
    expect(onTrack('disputeRate', 0.099, 3)).toBe('on_track');
    expect(onTrack('disputeRate', 0.1, 3)).toBe('behind');
    expect(onTrack('medianResolutionHours', 23.9, 3)).toBe('on_track');
    expect(onTrack('week4Retention', null, 3)).toBe('no_data');
  });
});
