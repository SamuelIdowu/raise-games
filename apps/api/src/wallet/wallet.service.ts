import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { db, schema } from '../db/client';
import type { Tx } from '../db/tx';
import { disputeRuledEventSchema } from '../disputes/dispute-events';
import type { HeldStake } from '../ledger/ledger.math';
import { getStanding } from '../moderation/standing';
import type { OutboxEvent } from '../realtime/outbox-relay';
import { FlagsService } from './flags.service';
import { ProviderRegistry } from './provider.registry';
import { type StakeDecision, type StakeRule, decideStake } from './stake-policy';
import { verifySignature } from './webhook-signature';

/** Outbox events the ledger consumer settles (TA Stage 2 flow). */
export const WALLET_EVENT_TYPES = [
  'challenge.accepted',
  'match.confirmed',
  'match.forfeited',
  'match.cancelled',
  'match.voided',
  'dispute.ruled',
] as const;

const providerEventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  data: z.record(z.string(), z.unknown()),
});

/**
 * Sprint 13 (F13.2–F13.4): stake checks, hold/settle wiring and provider webhooks.
 *
 * Every challenge goes through this path, Stage 1 included: holds are recorded per player
 * on acceptance and settled on the result exactly as in Stage 2. With a zero stake the
 * provider posts nothing, so the only Stage 2 change is the adapter plus the flag.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly providers: ProviderRegistry,
    private readonly flags: FlagsService,
  ) {}

  // ---------------------------------------------------------------- stake checks (F13.3)

  /** Decide whether `userId` may put up this stake. Never throws; see `assertStake`. */
  async checkStake(userId: string, stakeMinor: number, currency: string): Promise<StakeDecision> {
    const [u] = await db
      .select({ tier: schema.users.identityTier, state: schema.users.jurisdictionState })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!u) return { ok: false, code: 'invalid', message: 'Unknown player' };

    const [rules, restrictions, currencyAllowed, realMoneyEnabled] = await Promise.all([
      db
        .select({
          scope: schema.stakeLimitRules.scope,
          key: schema.stakeLimitRules.key,
          currency: schema.stakeLimitRules.currency,
          maxStakeMinor: schema.stakeLimitRules.maxStakeMinor,
        })
        .from(schema.stakeLimitRules)
        .where(
          and(
            eq(schema.stakeLimitRules.active, true),
            eq(schema.stakeLimitRules.currency, currency),
          ),
        ),
      this.restrictionsOf(userId),
      this.flags.isEnabled(`currency:${currency}`, { jurisdiction: u.state }),
      this.flags.isEnabled('real_money_stakes', { jurisdiction: u.state }),
    ]);
    return decideStake({
      stakeMinor,
      currency,
      tier: u.tier,
      restrictions,
      rules: rules as StakeRule[],
      currencyAllowed,
      realMoneyEnabled,
    });
  }

  async assertStake(userId: string, stakeMinor: number, currency: string): Promise<void> {
    const d = await this.checkStake(userId, stakeMinor, currency);
    if (!d.ok)
      throw new ForbiddenException({ message: d.message, code: d.code, capMinor: d.capMinor });
  }

  /** Account restrictions that map to stake-limit rules ('fraud_limited', 'self_excluded'). */
  async restrictionsOf(userId: string): Promise<string[]> {
    const out: string[] = [];
    const [limits] = await db
      .select({ until: schema.limitSettings.selfExcludedUntil })
      .from(schema.limitSettings)
      .where(eq(schema.limitSettings.userId, userId));
    if (limits?.until && limits.until > new Date()) out.push('self_excluded');
    // Same signal counts and thresholds as the moderation console (F12.4).
    if ((await getStanding(userId)).autoLimit.limited) out.push('fraud_limited');
    return out;
  }

  // ---------------------------------------------------------------- outbox consumer (F13.2)

  async handle(event: OutboxEvent): Promise<void> {
    await db.transaction(async (tx) => {
      switch (event.type) {
        case 'challenge.accepted': {
          const p = event.payload as { challengeId: string; acceptorId: string; matchId: string };
          await this.placeHolds(tx, p.challengeId, p.matchId);
          return;
        }
        case 'match.confirmed': {
          const p = event.payload as {
            matchId: string;
            winnerUserId: string | null;
            draw: boolean;
          };
          const key = `match.confirmed:${p.matchId}`;
          if (p.draw || !p.winnerUserId) await this.refund(tx, p.matchId, key);
          else await this.release(tx, p.matchId, p.winnerUserId, key);
          return;
        }
        case 'match.forfeited': {
          const p = event.payload as { matchId: string; winnerUserId: string };
          await this.release(tx, p.matchId, p.winnerUserId, `match.forfeited:${p.matchId}`);
          return;
        }
        case 'match.cancelled': {
          const p = event.payload as { matchId: string };
          await this.refund(tx, p.matchId, `match.cancelled:${p.matchId}`);
          return;
        }
        // Audit B22: a moderator voided a live match; every stake goes back.
        case 'match.voided': {
          const p = event.payload as { matchId: string };
          await this.refund(tx, p.matchId, `match.voided:${p.matchId}`);
          return;
        }
        case 'dispute.ruled': {
          const p = disputeRuledEventSchema.parse(event.payload);
          const key = `dispute.ruled:${p.disputeId}:${p.round}`;
          // ratingAction is the contract for "what ratings and holds must do" (Sprint 9).
          if (p.ratingAction === 'reverse' || p.ratingAction === 'reverse_and_apply') {
            await this.reverseSettlement(tx, p.matchId, `${key}:reverse`);
          }
          if (p.ratingAction === 'apply' || p.ratingAction === 'reverse_and_apply') {
            if (p.void || p.draw || !p.winnerUserId) await this.refund(tx, p.matchId, key);
            else await this.release(tx, p.matchId, p.winnerUserId, key);
          } else if (p.void) {
            await this.refund(tx, p.matchId, key);
          }
          return;
        }
      }
    });
  }

  /** One hold per player at acceptance, through the provider for the poster's state. */
  private async placeHolds(tx: Tx, challengeId: string, matchId: string): Promise<void> {
    const [c] = await tx
      .select({
        posterId: schema.challenges.posterId,
        stake: schema.challenges.stakeAmountMinor,
        currency: schema.challenges.currency,
      })
      .from(schema.challenges)
      .where(eq(schema.challenges.id, challengeId));
    if (!c) return;
    const sides = await tx
      .select({ userId: schema.matchSides.userId, state: schema.users.jurisdictionState })
      .from(schema.matchSides)
      .innerJoin(schema.users, eq(schema.users.id, schema.matchSides.userId))
      .where(eq(schema.matchSides.matchId, matchId));
    for (const side of sides) {
      const provider = await this.providers.resolve(side.state);
      const [hold] = await tx
        .insert(schema.ledgerHolds)
        .values({
          id: uuidv7(),
          challengeId,
          matchId,
          userId: side.userId,
          provider: provider.name,
          currency: c.currency,
          amountMinor: c.stake,
        })
        .onConflictDoNothing({
          target: [schema.ledgerHolds.challengeId, schema.ledgerHolds.userId],
        })
        .returning({ id: schema.ledgerHolds.id });
      if (!hold) continue; // redelivery: already held
      const txnId = await provider.hold(
        {
          key: `hold:${challengeId}:${side.userId}`,
          userId: side.userId,
          currency: c.currency,
          amountMinor: c.stake,
        },
        tx,
      );
      if (txnId) {
        await tx
          .update(schema.ledgerHolds)
          .set({ holdTransactionId: txnId })
          .where(eq(schema.ledgerHolds.id, hold.id));
      }
    }
  }

  private async heldFor(tx: Tx, matchId: string) {
    // The relay retries a failed `challenge.accepted` later; settle only after holds exist.
    const [any] = await tx
      .select({ id: schema.ledgerHolds.id })
      .from(schema.ledgerHolds)
      .where(eq(schema.ledgerHolds.matchId, matchId))
      .limit(1);
    if (!any) {
      const [m] = await tx
        .select({ challengeId: schema.matches.challengeId })
        .from(schema.matches)
        .where(eq(schema.matches.id, matchId));
      if (m) await this.placeHolds(tx, m.challengeId, matchId);
    }
    return tx
      .select()
      .from(schema.ledgerHolds)
      .where(and(eq(schema.ledgerHolds.matchId, matchId), eq(schema.ledgerHolds.status, 'held')))
      .for('update');
  }

  private async release(tx: Tx, matchId: string, winnerUserId: string, key: string) {
    const holds = await this.heldFor(tx, matchId);
    if (holds.length === 0) return; // already settled (redelivery) or never held
    const feeBps = await this.feeBpsFor(tx, matchId, holds);
    const provider = this.providers.byName(holds[0]!.provider);
    const txnId = await provider.release(
      {
        key: `settle:${key}`,
        holds: holds.map(toStake),
        winnerUserId,
        feeBps,
        currency: holds[0]!.currency,
        matchId,
      },
      tx,
    );
    await this.markSettled(tx, holds, 'released', txnId);
  }

  private async refund(tx: Tx, matchId: string, key: string) {
    const holds = await this.heldFor(tx, matchId);
    if (holds.length === 0) return;
    const provider = this.providers.byName(holds[0]!.provider);
    const txnId = await provider.refund(
      { key: `settle:${key}`, holds: holds.map(toStake), currency: holds[0]!.currency, matchId },
      tx,
    );
    await this.markSettled(tx, holds, 'refunded', txnId);
  }

  /** An appeal changed the ruling: undo the earlier settlement so the holds are live again. */
  private async reverseSettlement(tx: Tx, matchId: string, key: string) {
    const settled = await tx
      .select()
      .from(schema.ledgerHolds)
      .where(
        and(
          eq(schema.ledgerHolds.matchId, matchId),
          inArray(schema.ledgerHolds.status, ['released', 'refunded']),
        ),
      )
      .for('update');
    if (settled.length === 0) return;
    const txnId = settled[0]!.settleTransactionId;
    if (txnId) {
      await this.providers.byName(settled[0]!.provider).reverse({ key, transactionId: txnId }, tx);
    }
    await tx
      .update(schema.ledgerHolds)
      .set({ status: 'held', settleTransactionId: null, updatedAt: new Date() })
      .where(
        inArray(
          schema.ledgerHolds.id,
          settled.map((h) => h.id),
        ),
      );
  }

  private async markSettled(
    tx: Tx,
    holds: Array<{ id: string }>,
    status: 'released' | 'refunded',
    txnId: string | null,
  ) {
    await tx
      .update(schema.ledgerHolds)
      .set({ status, settleTransactionId: txnId, updatedAt: new Date() })
      .where(
        inArray(
          schema.ledgerHolds.id,
          holds.map((h) => h.id),
        ),
      );
  }

  /** Fee from the challenge's versioned fee schedule. Fails closed when stakes are real. */
  private async feeBpsFor(
    tx: Tx,
    matchId: string,
    holds: Array<{ amountMinor: number; currency: string }>,
  ) {
    if (holds.every((h) => h.amountMinor === 0)) return 0;
    const [row] = await tx
      .select({ params: schema.feeRules.params })
      .from(schema.matches)
      .innerJoin(schema.challenges, eq(schema.challenges.id, schema.matches.challengeId))
      .innerJoin(
        schema.feeRules,
        and(
          eq(schema.feeRules.version, schema.challenges.feeScheduleVersion),
          eq(schema.feeRules.currency, schema.challenges.currency),
        ),
      )
      .where(eq(schema.matches.id, matchId));
    const bps = (row?.params as { feeBps?: unknown } | undefined)?.feeBps;
    if (typeof bps !== 'number') throw new Error(`No fee rule for match ${matchId}`);
    return bps;
  }

  // ---------------------------------------------------------------- webhooks (F13.2)

  /**
   * A provider callback. Order matters: verify the signature over the raw body, store the
   * event (the (provider, event id) key makes a replay a no-op), then apply it in the same
   * transaction, so a crash between "stored" and "applied" leaves nothing half-done.
   */
  async receiveWebhook(
    providerName: string,
    rawBody: string,
    signature: string | undefined,
  ): Promise<{ status: 'applied' | 'ignored' | 'duplicate' }> {
    const secret = this.webhookSecret(providerName);
    const check = verifySignature(secret, rawBody, signature);
    if (!check.ok) throw new UnauthorizedException(`Invalid webhook signature (${check.reason})`);

    let parsed: z.infer<typeof providerEventSchema>;
    try {
      parsed = providerEventSchema.parse(JSON.parse(rawBody));
    } catch {
      throw new UnauthorizedException('Malformed webhook body');
    }
    const provider = this.providers.byName(providerName);

    return db.transaction(async (tx) => {
      const [stored] = await tx
        .insert(schema.providerWebhookEvents)
        .values({
          id: uuidv7(),
          provider: providerName,
          eventId: parsed.id,
          eventType: parsed.type,
          payload: parsed,
        })
        .onConflictDoNothing({
          target: [schema.providerWebhookEvents.provider, schema.providerWebhookEvents.eventId],
        })
        .returning({ id: schema.providerWebhookEvents.id });
      if (!stored) return { status: 'duplicate' as const };

      const outcome = await provider.applyCallback(parsed, tx);
      await tx
        .update(schema.providerWebhookEvents)
        .set({ processedAt: new Date(), outcome })
        .where(eq(schema.providerWebhookEvents.id, stored.id));
      return { status: outcome };
    });
  }

  /**
   * Only the mock exists in Stage 1. Its secret comes from the environment, and with no
   * secret the endpoint does not exist (404): production never sets it.
   */
  private webhookSecret(providerName: string): string {
    const secret =
      providerName === this.providers.mockProvider.name
        ? process.env.MOCK_PROVIDER_WEBHOOK_SECRET
        : undefined;
    if (!secret) throw new NotFoundException();
    return secret;
  }
}

function toStake(h: { userId: string; amountMinor: number }): HeldStake {
  return { userId: h.userId, amountMinor: h.amountMinor };
}
