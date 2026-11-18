import { describe, expect, it } from 'vitest';
import { memoryHit, resetRateLimitMemory } from '../shared/rate-limit';
import { type OpsSnapshot, REPEAT_MS, THRESHOLDS, evaluate, transitions } from './alert-rules';

const quiet: OpsSnapshot = {
  stuckMatches: 0,
  notificationAttempts: 100,
  notificationFailures: 0,
  outboxLagMs: { notifications: 0, wallet: 0 },
  outboxDead: 0,
  disputesOverSla: 0,
  ledgerIssues: 0,
};
const rules = (s: Partial<OpsSnapshot>) => evaluate({ ...quiet, ...s }).map((a) => a.rule);

describe('alert rules (F15.5)', () => {
  it('a healthy system raises nothing', () => {
    expect(evaluate(quiet)).toEqual([]);
  });

  it('stuck matches fire at the first one', () => {
    expect(rules({ stuckMatches: 1 })).toEqual(['stuck_matches']);
  });

  it('notification failures: rate above 5% with enough volume, absolute count below it', () => {
    expect(rules({ notificationAttempts: 100, notificationFailures: 5 })).toEqual([]);
    expect(rules({ notificationAttempts: 100, notificationFailures: 6 })).toEqual([
      'notification_failures',
    ]);
    expect(rules({ notificationAttempts: 10, notificationFailures: 4 })).toEqual([]);
    expect(rules({ notificationAttempts: 10, notificationFailures: 5 })).toEqual([
      'notification_failures',
    ]);
  });

  it('outbox lag fires per consumer past 2 minutes, as sev1', () => {
    expect(rules({ outboxLagMs: { wallet: THRESHOLDS.outboxLagMs } })).toEqual([]);
    const a = evaluate({
      ...quiet,
      outboxLagMs: { wallet: THRESHOLDS.outboxLagMs + 1, ratings: 5 },
    });
    expect(a).toEqual([expect.objectContaining({ rule: 'outbox_lag:wallet', severity: 'sev1' })]);
  });

  it('dead outbox events, disputes past SLA and ledger issues each fire', () => {
    expect(rules({ outboxDead: 1 })).toEqual(['outbox_dead']);
    expect(rules({ disputesOverSla: 1 })).toEqual(['dispute_backlog']);
    expect(evaluate({ ...quiet, ledgerIssues: 1 })[0]).toMatchObject({
      rule: 'ledger_imbalance',
      severity: 'sev1',
    });
  });
});

describe('alert de-duplication', () => {
  const a = evaluate({ ...quiet, stuckMatches: 2 });

  it('announces once, repeats hourly while firing, then resolves once', () => {
    const t0 = 1_000_000;
    const first = transitions(a, new Map(), t0);
    expect(first.announce.map((x) => x.rule)).toEqual(['stuck_matches']);
    const again = transitions(a, first.next, t0 + 5 * 60_000);
    expect(again.announce).toEqual([]);
    const hourly = transitions(a, again.next, t0 + REPEAT_MS);
    expect(hourly.announce).toHaveLength(1);
    const cleared = transitions([], hourly.next, t0 + REPEAT_MS + 1);
    expect(cleared.resolved).toEqual(['stuck_matches']);
    expect(transitions([], cleared.next, t0 + REPEAT_MS + 2).resolved).toEqual([]);
  });
});

describe('rate-limit fallback (audit #8)', () => {
  it('counts per key within the window and resets after it', () => {
    resetRateLimitMemory();
    const now = 1_000;
    expect(memoryHit('k', 1000, now)).toBe(1);
    expect(memoryHit('k', 1000, now + 10)).toBe(2);
    expect(memoryHit('other', 1000, now + 10)).toBe(1);
    expect(memoryHit('k', 1000, now + 1000)).toBe(1);
  });
});
