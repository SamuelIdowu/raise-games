import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Tx } from '../db/tx';
import { holdLegs, refundLegs, releaseLegs } from '../ledger/ledger.math';
import { LedgerService } from '../ledger/ledger.service';
import type { ProviderEvent, WalletProviderPort } from './wallet-provider.port';

export const MOCK_PROVIDER = 'mock';

const moneyEvent = z.object({
  userId: z.uuid(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  amountMinor: z.number().int().positive(),
});

/**
 * The Stage 1 provider: executes the provider semantics directly in our ledger. Funds
 * "outside" the platform live in `provider:mock:clearing`, which mirrors a real provider's
 * settlement account (it goes negative as money comes in).
 */
@Injectable()
export class MockProviderAdapter implements WalletProviderPort {
  readonly name = MOCK_PROVIDER;

  constructor(private readonly ledger: LedgerService) {}

  async hold(
    input: { key: string; userId: string; currency: string; amountMinor: number },
    tx: Tx,
  ): Promise<string | null> {
    if (input.amountMinor === 0) return null;
    const posted = await this.ledger.post(
      {
        idempotencyKey: input.key,
        kind: 'hold',
        currency: input.currency,
        legs: holdLegs(input.userId, input.amountMinor),
      },
      tx,
    );
    return posted.id;
  }

  async release(
    input: Parameters<WalletProviderPort['release']>[0],
    tx: Tx,
  ): Promise<string | null> {
    if (input.holds.every((h) => h.amountMinor === 0)) return null;
    const posted = await this.ledger.post(
      {
        idempotencyKey: input.key,
        kind: 'release',
        currency: input.currency,
        legs: releaseLegs(input.holds, input.winnerUserId, input.feeBps),
        reference: { type: 'match', id: input.matchId },
      },
      tx,
    );
    return posted.id;
  }

  async refund(input: Parameters<WalletProviderPort['refund']>[0], tx: Tx): Promise<string | null> {
    if (input.holds.every((h) => h.amountMinor === 0)) return null;
    const posted = await this.ledger.post(
      {
        idempotencyKey: input.key,
        kind: 'refund',
        currency: input.currency,
        legs: refundLegs(input.holds),
        reference: { type: 'match', id: input.matchId },
      },
      tx,
    );
    return posted.id;
  }

  async reverse(input: { key: string; transactionId: string }, tx: Tx): Promise<string> {
    return (await this.ledger.reverse(input.transactionId, input.key, tx)).id;
  }

  async applyCallback(event: ProviderEvent, tx: Tx): Promise<'applied' | 'ignored'> {
    const key = `provider:${MOCK_PROVIDER}:${event.id}`;
    const clearing = { type: 'provider_clearing' as const, owner: MOCK_PROVIDER };
    if (event.type === 'deposit.succeeded') {
      const d = moneyEvent.parse(event.data);
      await this.ledger.post(
        {
          idempotencyKey: key,
          kind: 'deposit',
          currency: d.currency,
          legs: [
            { account: clearing, amountMinor: -d.amountMinor },
            { account: { type: 'user_available', owner: d.userId }, amountMinor: d.amountMinor },
          ],
          reference: { type: 'provider_event', id: event.id },
        },
        tx,
      );
      return 'applied';
    }
    if (event.type === 'withdrawal.paid') {
      const d = moneyEvent.parse(event.data);
      await this.ledger.post(
        {
          idempotencyKey: key,
          kind: 'withdrawal',
          currency: d.currency,
          legs: [
            { account: { type: 'user_available', owner: d.userId }, amountMinor: -d.amountMinor },
            { account: clearing, amountMinor: d.amountMinor },
          ],
          reference: { type: 'provider_event', id: event.id },
        },
        tx,
      );
      return 'applied';
    }
    return 'ignored';
  }
}
