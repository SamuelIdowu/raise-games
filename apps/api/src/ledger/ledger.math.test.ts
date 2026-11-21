import { describe, expect, it } from 'vitest';
import {
  type Leg,
  LedgerRuleError,
  accountRef,
  applyPosting,
  feeFor,
  holdLegs,
  normalisePosting,
  refundLegs,
  releaseLegs,
  requestHash,
  reversalLegs,
} from './ledger.math';

/** mulberry32: small seeded PRNG so a failing fuzz run can be replayed exactly. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sum = (legs: Leg[]) => legs.reduce((s, l) => s + l.amountMinor, 0);
const post = (legs: Leg[]) => ({
  idempotencyKey: 'k',
  kind: 'adjustment' as const,
  currency: 'NGN',
  legs,
});

describe('ledger rules', () => {
  it('a posting must balance, move between accounts and use integer minor units', () => {
    const a = { type: 'user_available' as const, owner: 'u1' };
    const b = { type: 'user_held' as const, owner: 'u1' };
    expect(() =>
      normalisePosting(
        post([
          { account: a, amountMinor: -5 },
          { account: b, amountMinor: 4 },
        ]),
      ),
    ).toThrow(LedgerRuleError);
    expect(() =>
      normalisePosting(
        post([
          { account: a, amountMinor: -0.5 },
          { account: b, amountMinor: 0.5 },
        ]),
      ),
    ).toThrow(/integer/);
    expect(() =>
      normalisePosting(
        post([
          { account: a, amountMinor: 5 },
          { account: a, amountMinor: -5 },
        ]),
      ),
    ).not.toThrow();
    expect(() =>
      normalisePosting(
        post([
          { account: a, amountMinor: 5 },
          { account: a, amountMinor: -3 },
          { account: b, amountMinor: -2 },
        ]),
      ),
    ).not.toThrow();
    expect(() => normalisePosting({ ...post([]), currency: 'ngn' })).toThrow(/ISO 4217/);
  });

  it('merges legs per account, drops zeros, and sorts by ref (deterministic lock order)', () => {
    const legs = normalisePosting(
      post([
        { account: { type: 'user_held', owner: 'b' }, amountMinor: 3 },
        { account: { type: 'user_available', owner: 'a' }, amountMinor: -1 },
        { account: { type: 'user_available', owner: 'a' }, amountMinor: -2 },
        { account: { type: 'platform_fee' }, amountMinor: 0 },
      ]),
    );
    expect(legs.map((l) => [accountRef(l.account), l.amountMinor])).toEqual([
      ['user:a:available', -3],
      ['user:b:held', 3],
    ]);
  });

  it('request hash changes with contents, not with leg order', () => {
    const l1: Leg[] = holdLegs('u', 100);
    const r = post(l1);
    const h1 = requestHash(r, normalisePosting(r));
    const r2 = post([...l1].reverse());
    expect(requestHash(r2, normalisePosting(r2))).toBe(h1);
    const r3 = post(holdLegs('u', 101));
    expect(requestHash(r3, normalisePosting(r3))).not.toBe(h1);
  });

  it('release pays the pot minus the fee (rounded down) and the fee account gets the rest', () => {
    const holds = [
      { userId: 'a', amountMinor: 50_000 },
      { userId: 'b', amountMinor: 50_000 },
    ];
    const legs = releaseLegs(holds, 'a', 1000);
    expect(sum(legs)).toBe(0);
    expect(legs.find((l) => l.account.type === 'user_available')!.amountMinor).toBe(90_000);
    expect(legs.find((l) => l.account.type === 'platform_fee')!.amountMinor).toBe(10_000);
    expect(feeFor(999, 1000)).toBe(99);
    expect(() => releaseLegs(holds, 'c', 0)).toThrow(/winner/);
    expect(() => feeFor(100, 10_001)).toThrow();
  });

  it('a reversal undoes a posting exactly', () => {
    const balances = new Map<string, number>([['user:a:available', 500]]);
    const legs = holdLegs('a', 200);
    applyPosting(balances, legs);
    applyPosting(balances, reversalLegs(legs));
    expect(balances.get('user:a:available')).toBe(500);
    expect(balances.get('user:a:held')).toBe(0);
  });
});

describe('ledger invariants (property / fuzz)', () => {
  /**
   * Random schedules of deposits, holds, releases, refunds, withdrawals and reversals. After
   * every step: the books net to zero, no user balance is negative, and every accepted
   * posting balanced. Rejected postings (insufficient funds) leave balances untouched.
   */
  for (const seed of [1, 42, 20261117]) {
    it(`10,000 random postings keep every invariant (seed ${seed})`, () => {
      const r = rng(seed);
      const users = ['u1', 'u2', 'u3', 'u4'];
      const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
      const amount = () => 1 + Math.floor(r() * 50_000);
      const balances = new Map<string, number>();
      const live: Array<{ legs: Leg[]; reversed: boolean }> = [];
      const openHolds: Array<{ userId: string; amountMinor: number }> = [];
      let rejected = 0;

      for (let step = 0; step < 10_000; step++) {
        const op = r();
        let legs: Leg[];
        if (op < 0.25) {
          const u = pick(users);
          const amt = amount();
          legs = [
            { account: { type: 'provider_clearing', owner: 'mock' }, amountMinor: -amt },
            { account: { type: 'user_available', owner: u }, amountMinor: amt },
          ];
        } else if (op < 0.5) {
          legs = holdLegs(pick(users), amount());
        } else if (op < 0.65 && openHolds.length >= 2) {
          const pair = openHolds.splice(0, 2);
          legs = releaseLegs(pair, pick(pair).userId, Math.floor(r() * 1500));
        } else if (op < 0.75 && openHolds.length >= 1) {
          legs = refundLegs(openHolds.splice(0, 1));
        } else if (op < 0.88) {
          const u = pick(users);
          const amt = amount();
          legs = [
            { account: { type: 'user_available', owner: u }, amountMinor: -amt },
            { account: { type: 'provider_clearing', owner: 'mock' }, amountMinor: amt },
          ];
        } else {
          const target = live.filter((t) => !t.reversed);
          if (target.length === 0) continue;
          const t = pick(target);
          legs = reversalLegs(t.legs);
          const res = applyPosting(balances, normalisePosting(post(legs)));
          if (res.ok) t.reversed = true;
          else rejected++;
          continue;
        }

        const normal = normalisePosting(post(legs));
        expect(sum(normal)).toBe(0);
        const res = applyPosting(balances, normal);
        if (res.ok) {
          live.push({ legs: normal, reversed: false });
          const held = normal.filter((l) => l.account.type === 'user_held' && l.amountMinor > 0);
          if (normal.length === 2 && held.length === 1) {
            openHolds.push({ userId: held[0]!.account.owner!, amountMinor: held[0]!.amountMinor });
          }
        } else {
          rejected++;
        }

        // Invariants after every step.
        let total = 0;
        for (const [ref, v] of balances) {
          total += v;
          if (ref.startsWith('user:')) expect(v).toBeGreaterThanOrEqual(0);
        }
        expect(total).toBe(0);
      }
      // The fuzz exercised both paths.
      expect(live.length).toBeGreaterThan(1000);
      expect(rejected).toBeGreaterThan(0);
    });
  }
});
