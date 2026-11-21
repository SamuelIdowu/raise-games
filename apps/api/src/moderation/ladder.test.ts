import { describe, expect, it } from 'vitest';
import {
  LADDER,
  evaluateEscalation,
  nextStep,
  restrictionsOf,
  sanctionSummary,
  windowFor,
} from './ladder';

describe('sanction ladder (PRD: warning → 7d → 30d → permanent ban)', () => {
  it('climbs one rung above the highest prior step, capped at a ban', () => {
    expect(nextStep([])).toBe(1);
    expect(nextStep([1])).toBe(2);
    expect(nextStep([1, 2])).toBe(3);
    expect(nextStep([3])).toBe(4);
    expect(nextStep([4, 4])).toBe(4);
  });

  it('maps steps to the PRD durations', () => {
    const now = new Date('2026-11-17T12:00:00Z');
    expect(LADDER[1].type).toBe('warning');
    expect(windowFor(1, now).endsAt).toEqual(now); // instant: on record, never active
    expect(windowFor(2, now).endsAt!.getTime() - now.getTime()).toBe(7 * 86_400_000);
    expect(windowFor(3, now).endsAt!.getTime() - now.getTime()).toBe(30 * 86_400_000);
    expect(windowFor(4, now).endsAt).toBeNull();
    expect(LADDER[4].type).toBe('permanent_ban');
  });

  it('suspensions stop play but not login; bans stop both; warnings stop nothing', () => {
    expect(restrictionsOf('warning')).toEqual({ loginBlocked: false, playBlocked: false });
    expect(restrictionsOf('suspension')).toEqual({ loginBlocked: false, playBlocked: true });
    expect(restrictionsOf('permanent_ban')).toEqual({ loginBlocked: true, playBlocked: true });
    expect(restrictionsOf(null)).toEqual({ loginBlocked: false, playBlocked: false });
  });

  it('player-facing copy is plain and not shaming (Design §9)', () => {
    const copy = [1, 2, 3, 4].map((s) => sanctionSummary(s as 1, new Date('2026-12-01T00:00:00Z')));
    for (const c of copy) expect(c).not.toMatch(/cheat|fraud|scam|banned for life|shame/i);
    expect(copy[1]).toMatch(/still finish your current matches/);
  });
});

describe('auto-limit escalation', () => {
  const zero = {
    reusedScreenshots: 0,
    actionedReports: 0,
    disputesLostAsOpener: 0,
    reputationDebts: 0,
  };

  it('stays clear below every threshold', () => {
    expect(
      evaluateEscalation({ ...zero, reusedScreenshots: 1, actionedReports: 2, reputationDebts: 2 }),
    ).toEqual({
      limited: false,
      reasons: [],
    });
  });

  it('limits when any one threshold is reached, listing the reasons', () => {
    expect(evaluateEscalation({ ...zero, reusedScreenshots: 2 })).toEqual({
      limited: true,
      reasons: ['reusedScreenshots'],
    });
    expect(evaluateEscalation({ ...zero, actionedReports: 3, reputationDebts: 5 }).reasons).toEqual(
      ['actionedReports', 'reputationDebts'],
    );
  });
});
