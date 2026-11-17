import type { Tx } from '../db/tx';
import type { HeldStake } from '../ledger/ledger.math';

/**
 * WalletProvider port (Sprint 13, F13.2; TA "A WalletProvider port, with a feature flag per
 * stage and jurisdiction gating any real provider").
 *
 * Stage 1 runs every challenge through the mock with a zero stake. Stage 2 swaps in a
 * licensed provider's adapter and turns the jurisdiction flag on; nothing else changes.
 * All methods are idempotent on their key and take the caller's transaction so ledger
 * postings commit with the domain change that caused them.
 */
export interface WalletProviderPort {
  readonly name: string;
  /** Move a stake from available to held. Returns the ledger transaction (null for 0). */
  hold(
    input: { key: string; userId: string; currency: string; amountMinor: number },
    tx: Tx,
  ): Promise<string | null>;
  /** Pay the pot minus the fee to the winner. */
  release(
    input: {
      key: string;
      holds: HeldStake[];
      winnerUserId: string;
      feeBps: number;
      currency: string;
      matchId: string;
    },
    tx: Tx,
  ): Promise<string | null>;
  /** Return every held stake to its owner. */
  refund(
    input: { key: string; holds: HeldStake[]; currency: string; matchId: string },
    tx: Tx,
  ): Promise<string | null>;
  /** Undo an earlier release or refund (a ruling changed on appeal). */
  reverse(input: { key: string; transactionId: string }, tx: Tx): Promise<string>;
  /** Apply a verified provider callback (deposit settled, withdrawal paid, …). */
  applyCallback(event: ProviderEvent, tx: Tx): Promise<'applied' | 'ignored'>;
}

export interface ProviderEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
}
