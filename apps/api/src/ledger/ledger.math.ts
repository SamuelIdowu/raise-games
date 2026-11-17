import { createHash } from 'node:crypto';

/**
 * Pure ledger rules (Sprint 13, F13.1). No I/O: the service applies these inside a
 * transaction, and the property tests fuzz them directly.
 *
 * Money is integer minor units with an ISO 4217 code; there are no floats anywhere.
 */

export type AccountType = 'user_available' | 'user_held' | 'platform_fee' | 'provider_clearing';

export type TransactionKind =
  'hold' | 'release' | 'refund' | 'deposit' | 'withdrawal' | 'reversal' | 'adjustment';

/** A logical account; the service resolves it to a row (creating it on first use). */
export interface AccountKey {
  type: AccountType;
  /** User id for user_* accounts, provider name for provider_clearing, absent otherwise. */
  owner?: string;
}

export interface Leg {
  account: AccountKey;
  amountMinor: number;
}

export interface PostingRequest {
  idempotencyKey: string;
  kind: TransactionKind;
  currency: string;
  legs: Leg[];
  reference?: { type: string; id: string };
}

export class LedgerRuleError extends Error {}

export const CURRENCY_RE = /^[A-Z]{3}$/;

export function accountRef(key: AccountKey): string {
  switch (key.type) {
    case 'user_available':
      return `user:${key.owner}:available`;
    case 'user_held':
      return `user:${key.owner}:held`;
    case 'platform_fee':
      return 'platform:fees';
    case 'provider_clearing':
      return `provider:${key.owner}:clearing`;
  }
}

/** Clearing accounts mirror money outside the platform, so they may go negative. */
export function allowsNegative(type: AccountType): boolean {
  return type === 'provider_clearing';
}

/**
 * Merges legs on the same account and drops zero legs, then checks the posting is a valid
 * double entry: at least two accounts, integer amounts, and a zero sum. Returns the
 * normalised legs (sorted by account ref, so lock order is deterministic).
 */
export function normalisePosting(req: PostingRequest): Leg[] {
  if (!CURRENCY_RE.test(req.currency)) throw new LedgerRuleError('currency must be ISO 4217');
  if (!req.idempotencyKey) throw new LedgerRuleError('idempotency key required');
  const merged = new Map<string, Leg>();
  for (const leg of req.legs) {
    if (!Number.isSafeInteger(leg.amountMinor)) {
      throw new LedgerRuleError('amounts must be integer minor units');
    }
    if (
      (leg.account.type === 'user_available' || leg.account.type === 'user_held') &&
      !leg.account.owner
    ) {
      throw new LedgerRuleError('user accounts need an owner');
    }
    const ref = accountRef(leg.account);
    const prev = merged.get(ref);
    merged.set(ref, {
      account: leg.account,
      amountMinor: (prev?.amountMinor ?? 0) + leg.amountMinor,
    });
  }
  const legs = [...merged.entries()]
    .filter(([, l]) => l.amountMinor !== 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, l]) => l);
  const sum = legs.reduce((s, l) => s + l.amountMinor, 0);
  if (sum !== 0) throw new LedgerRuleError(`posting does not balance (sum ${sum})`);
  if (legs.length === 1) throw new LedgerRuleError('a posting moves money between accounts');
  return legs;
}

/** Canonical hash of what a posting does, so a replay with different contents is refused. */
export function requestHash(req: PostingRequest, legs: Leg[]): string {
  const canonical = JSON.stringify({
    kind: req.kind,
    currency: req.currency,
    reference: req.reference ?? null,
    legs: legs.map((l) => [accountRef(l.account), l.amountMinor]),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** The legs that undo a posting. */
export function reversalLegs(legs: Leg[]): Leg[] {
  return legs.map((l) => ({ account: l.account, amountMinor: -l.amountMinor }));
}

// ---------------------------------------------------------------- settlement plans

export interface HeldStake {
  userId: string;
  amountMinor: number;
}

/** Hold: the stake moves from the player's available balance to their held balance. */
export function holdLegs(userId: string, amountMinor: number): Leg[] {
  return [
    { account: { type: 'user_available', owner: userId }, amountMinor: -amountMinor },
    { account: { type: 'user_held', owner: userId }, amountMinor },
  ];
}

/** Refund: each held stake goes back to its owner's available balance. */
export function refundLegs(holds: HeldStake[]): Leg[] {
  return holds.flatMap((h) => [
    { account: { type: 'user_held', owner: h.userId }, amountMinor: -h.amountMinor },
    { account: { type: 'user_available', owner: h.userId }, amountMinor: h.amountMinor },
  ]);
}

/**
 * Fee in minor units for a pot, in basis points, rounded down (the player keeps the
 * remainder). 0 bps in Stage 1.
 */
export function feeFor(potMinor: number, feeBps: number): number {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new LedgerRuleError('fee must be 0–10000 basis points');
  }
  return Math.floor((potMinor * feeBps) / 10_000);
}

/**
 * Release (TA Stage 2 flow): every held stake leaves the held accounts; the winner gets the
 * pot minus the platform fee. A draw refunds instead (no fee).
 */
export function releaseLegs(holds: HeldStake[], winnerUserId: string, feeBps: number): Leg[] {
  if (!holds.some((h) => h.userId === winnerUserId)) {
    throw new LedgerRuleError('the winner must be one of the held players');
  }
  const pot = holds.reduce((s, h) => s + h.amountMinor, 0);
  const fee = feeFor(pot, feeBps);
  return [
    ...holds.map((h) => ({
      account: { type: 'user_held' as const, owner: h.userId },
      amountMinor: -h.amountMinor,
    })),
    { account: { type: 'user_available', owner: winnerUserId }, amountMinor: pot - fee },
    { account: { type: 'platform_fee' }, amountMinor: fee },
  ];
}

// ---------------------------------------------------------------- in-memory model

/** Applies postings to a balance map exactly as the service does, for property tests. */
export function applyPosting(
  balances: Map<string, number>,
  legs: Leg[],
): { ok: true } | { ok: false; reason: string } {
  const next = new Map(balances);
  for (const leg of legs) {
    const ref = accountRef(leg.account);
    const value = (next.get(ref) ?? 0) + leg.amountMinor;
    if (value < 0 && !allowsNegative(leg.account.type)) {
      return { ok: false, reason: `insufficient funds in ${ref}` };
    }
    next.set(ref, value);
  }
  for (const [k, v] of next) balances.set(k, v);
  return { ok: true };
}
