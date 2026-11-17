/**
 * Stake rules (Sprint 13, F13.3 + F13.4). Pure: the caller gathers the inputs (identity
 * tier, restrictions, the rule rows, jurisdiction flags) and this decides. The order of the
 * checks is part of the rule, so a stake is refused for the most specific reason:
 *
 *   1. self-exclusion            → no stakes at all
 *   2. currency allowed for the player's jurisdiction
 *   3. tier cap and restriction caps (lowest wins; no tier rule = no stakes, fail closed)
 *   4. real money enabled for the stage + jurisdiction (off for all of Stage 1)
 *
 * Caps are checked before the real-money flag on purpose: a Stage 1 request above the cap
 * is refused as "above your limit" even though stakes are free, which proves the caps are
 * wired before Stage 2 turns money on.
 */

export interface StakeRule {
  scope: 'tier' | 'restriction';
  key: string;
  currency: string;
  maxStakeMinor: number;
}

export interface StakeContext {
  stakeMinor: number;
  currency: string;
  tier: string;
  /** e.g. 'fraud_limited' (F12.4 auto-limit), 'self_excluded'. */
  restrictions: string[];
  rules: StakeRule[];
  currencyAllowed: boolean;
  realMoneyEnabled: boolean;
}

export type StakeDecision =
  | { ok: true; capMinor: number }
  | {
      ok: false;
      code:
        'self_excluded' | 'currency_not_allowed' | 'above_cap' | 'real_money_disabled' | 'invalid';
      message: string;
      capMinor?: number;
    };

export function effectiveCap(
  ctx: Pick<StakeContext, 'currency' | 'tier' | 'restrictions' | 'rules'>,
): number {
  const applicable = ctx.rules.filter(
    (r) =>
      r.currency === ctx.currency &&
      ((r.scope === 'tier' && r.key === ctx.tier) ||
        (r.scope === 'restriction' && ctx.restrictions.includes(r.key))),
  );
  if (!applicable.some((r) => r.scope === 'tier')) return 0; // fail closed
  return Math.min(...applicable.map((r) => r.maxStakeMinor));
}

export function decideStake(ctx: StakeContext): StakeDecision {
  if (!Number.isSafeInteger(ctx.stakeMinor) || ctx.stakeMinor < 0) {
    return { ok: false, code: 'invalid', message: 'Stake must be a whole, non-negative amount' };
  }
  if (ctx.restrictions.includes('self_excluded') && ctx.stakeMinor > 0) {
    return { ok: false, code: 'self_excluded', message: 'You have excluded yourself from stakes' };
  }
  if (!ctx.currencyAllowed) {
    return {
      ok: false,
      code: 'currency_not_allowed',
      message: `${ctx.currency} is not available in your state`,
    };
  }
  const cap = effectiveCap(ctx);
  if (ctx.stakeMinor > cap) {
    return { ok: false, code: 'above_cap', message: 'Stake is above your limit', capMinor: cap };
  }
  if (ctx.stakeMinor > 0 && !ctx.realMoneyEnabled) {
    return {
      ok: false,
      code: 'real_money_disabled',
      message: 'Stakes are not available yet. Challenges are free.',
      capMinor: cap,
    };
  }
  return { ok: true, capMinor: cap };
}
