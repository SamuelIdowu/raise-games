import { describe, expect, it } from 'vitest';
import { COOLING_OFF_MS, type LimitState, applyChange, settlePending } from './limits';
import { type StakeContext, decideStake, effectiveCap } from './stake-policy';
import { signPayload, verifySignature } from './webhook-signature';

const rules: StakeContext['rules'] = [
  { scope: 'tier', key: 'tier1_phone_verified', currency: 'NGN', maxStakeMinor: 100_000 },
  { scope: 'tier', key: 'tier2_kyc', currency: 'NGN', maxStakeMinor: 1_000_000 },
  { scope: 'restriction', key: 'fraud_limited', currency: 'NGN', maxStakeMinor: 0 },
];
const base: StakeContext = {
  stakeMinor: 0,
  currency: 'NGN',
  tier: 'tier1_phone_verified',
  restrictions: [],
  rules,
  currencyAllowed: true,
  realMoneyEnabled: false,
};

describe('stake policy (F13.3/F13.4)', () => {
  it('Stage 1: a free challenge passes', () => {
    expect(decideStake(base)).toEqual({ ok: true, capMinor: 100_000 });
  });

  it('caps are enforced before the real-money flag (wiring proof while stakes are free)', () => {
    expect(decideStake({ ...base, stakeMinor: 100_001 })).toMatchObject({
      ok: false,
      code: 'above_cap',
    });
    expect(decideStake({ ...base, stakeMinor: 50_000 })).toMatchObject({
      ok: false,
      code: 'real_money_disabled',
    });
    expect(decideStake({ ...base, stakeMinor: 50_000, realMoneyEnabled: true })).toMatchObject({
      ok: true,
    });
  });

  it('the lowest applicable cap wins; a restriction can take it to zero', () => {
    expect(effectiveCap({ ...base, tier: 'tier2_kyc' })).toBe(1_000_000);
    expect(effectiveCap({ ...base, tier: 'tier2_kyc', restrictions: ['fraud_limited'] })).toBe(0);
  });

  it('fails closed: no rule for the tier or currency means no stakes', () => {
    expect(effectiveCap({ ...base, tier: 'tier9_unknown' })).toBe(0);
    expect(effectiveCap({ ...base, currency: 'USD' })).toBe(0);
    expect(
      decideStake({ ...base, tier: 'tier9_unknown', stakeMinor: 1, realMoneyEnabled: true }),
    ).toMatchObject({ ok: false, code: 'above_cap' });
  });

  it('currency must be allowed in the player’s state; self-exclusion blocks any stake', () => {
    expect(decideStake({ ...base, currencyAllowed: false })).toMatchObject({
      code: 'currency_not_allowed',
    });
    expect(
      decideStake({
        ...base,
        stakeMinor: 1,
        restrictions: ['self_excluded'],
        realMoneyEnabled: true,
      }),
    ).toMatchObject({ code: 'self_excluded' });
    expect(decideStake({ ...base, restrictions: ['self_excluded'] })).toMatchObject({ ok: true });
  });

  it('rejects fractional or negative stakes', () => {
    expect(decideStake({ ...base, stakeMinor: -1 })).toMatchObject({ code: 'invalid' });
    expect(decideStake({ ...base, stakeMinor: 1.5 })).toMatchObject({ code: 'invalid' });
  });
});

describe('responsible-gaming limits (F13.5)', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  const empty: LimitState = {
    limits: { daily: null, weekly: null, monthly: null },
    pending: null,
    pendingEffectiveAt: null,
    selfExcludedUntil: null,
  };

  it('setting or lowering a limit applies at once', () => {
    const a = applyChange(empty, { limits: { daily: 10_000 } }, now);
    expect(a.limits.daily).toBe(10_000);
    const b = applyChange(a, { limits: { daily: 5_000 } }, now);
    expect(b.limits.daily).toBe(5_000);
    expect(b.pending).toBeNull();
  });

  it('raising or removing a limit waits out the cooling-off period', () => {
    const a = applyChange(empty, { limits: { daily: 10_000 } }, now);
    const b = applyChange(a, { limits: { daily: 50_000 } }, now);
    expect(b.limits.daily).toBe(10_000);
    expect(b.pending).toEqual({ daily: 50_000 });
    expect(b.pendingEffectiveAt!.getTime()).toBe(now.getTime() + COOLING_OFF_MS);
    expect(settlePending(b, new Date(now.getTime() + COOLING_OFF_MS - 1)).limits.daily).toBe(
      10_000,
    );
    expect(settlePending(b, new Date(now.getTime() + COOLING_OFF_MS)).limits.daily).toBe(50_000);
    const c = applyChange(a, { limits: { daily: null } }, now);
    expect(c.limits.daily).toBe(10_000);
    expect(c.pending).toEqual({ daily: null });
  });

  it('a tighter limit cancels a pending loosening', () => {
    const a = applyChange(empty, { limits: { daily: 10_000 } }, now);
    const b = applyChange(a, { limits: { daily: 50_000 } }, now);
    const c = applyChange(b, { limits: { daily: 8_000 } }, now);
    expect(c.limits.daily).toBe(8_000);
    expect(c.pending).toBeNull();
  });

  it('self-exclusion extends but never shortens', () => {
    const a = applyChange(empty, { selfExcludeDays: 30 }, now);
    const b = applyChange(a, { selfExcludeDays: 7 }, now);
    expect(b.selfExcludedUntil).toEqual(a.selfExcludedUntil);
    const c = applyChange(a, { selfExcludeDays: 90 }, now);
    expect(c.selfExcludedUntil!.getTime()).toBeGreaterThan(a.selfExcludedUntil!.getTime());
    expect(() => applyChange(empty, { selfExcludeDays: 0 }, now)).toThrow();
  });
});

describe('webhook signature (F13.2)', () => {
  const secret = 'test-secret-0123456789';
  const body = '{"id":"evt_1","type":"deposit.succeeded","data":{}}';
  const t = 1_800_000_000;

  it('accepts a correct signature inside the tolerance', () => {
    expect(verifySignature(secret, body, signPayload(secret, body, t), t + 10)).toEqual({
      ok: true,
    });
  });

  it('rejects tampered bodies, wrong secrets, stale or future timestamps, and junk headers', () => {
    const sig = signPayload(secret, body, t);
    expect(verifySignature(secret, body.replace('evt_1', 'evt_2'), sig, t)).toMatchObject({
      reason: 'mismatch',
    });
    expect(verifySignature('other-secret-0123456789', body, sig, t)).toMatchObject({
      reason: 'mismatch',
    });
    expect(verifySignature(secret, body, sig, t + 301)).toMatchObject({ reason: 'stale' });
    expect(verifySignature(secret, body, sig, t - 301)).toMatchObject({ reason: 'stale' });
    expect(verifySignature(secret, body, undefined, t)).toMatchObject({ reason: 'missing' });
    expect(verifySignature(secret, body, 't=abc,v1=zz', t)).toMatchObject({ reason: 'malformed' });
    // Re-signing with a fresh timestamp requires the secret: changing t alone fails.
    expect(
      verifySignature(secret, body, sig.replace(`t=${t}`, `t=${t + 100}`), t + 100),
    ).toMatchObject({
      reason: 'mismatch',
    });
  });
});
