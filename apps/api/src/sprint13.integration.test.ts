/**
 * Sprint 13 — ledger, mock wallet provider, stake limits, jurisdiction flags.
 * Needs Postgres and Redis.
 *
 * Isolation: every run uses its own ISO 4217 test currency (`X` + two letters; the X range
 * is reserved for testing), so its accounts, fee rule, stake rules and flags never touch
 * other suites or the NGN books, and cleanup can remove them completely.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { AppModule } from './app.module';
import { db, schema } from './db/client';
import { LedgerService } from './ledger/ledger.service';
import type { OutboxEvent } from './realtime/outbox-relay';
import { FlagsService } from './wallet/flags.service';
import { ProviderRegistry } from './wallet/provider.registry';
import { WalletService } from './wallet/wallet.service';
import { signPayload } from './wallet/webhook-signature';
import { retryOnDeadlock } from './test-fixtures/retry';

const SECRET = 'sprint13-test-webhook-secret';

describe('Sprint 13 - ledger & stage 2 foundations', () => {
  let moduleRef: TestingModule;
  let ledger: LedgerService;
  let wallet: WalletService;
  let flags: FlagsService;
  let registry: ProviderRegistry;
  let gameId = '';
  let formatId = '';
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const CUR = `X${L[Math.floor(Math.random() * 26)]}${L[Math.floor(Math.random() * 26)]}`;
  const STATE = `TestState-${uuidv7().slice(-6)}`;
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const matchIds: string[] = [];
  const flagIds: string[] = [];
  let phone = Math.floor(Math.random() * 1_000_000);

  async function player(
    name: string,
    tier: 'tier1_phone_verified' | 'tier2_kyc' = 'tier1_phone_verified',
  ) {
    const id = uuidv7();
    await db.insert(schema.users).values({
      id,
      phone: `+23493${(phone++).toString().padStart(8, '0')}`,
      displayName: `${name}_${id.slice(-6)}`,
      jurisdictionState: STATE,
      identityTier: tier,
    });
    userIds.push(id);
    await db
      .insert(schema.gameProfiles)
      .values({ id: uuidv7(), userId: id, gameId, inGameId: `${name}_${id.slice(-6)}` });
    return id;
  }

  /** A staked, accepted challenge with its match (sides 0 = a, 1 = b). */
  async function stakedMatch(a: string, b: string, stakeMinor: number) {
    const challengeId = uuidv7();
    const now = new Date();
    await db.insert(schema.challenges).values({
      id: challengeId,
      gameId,
      formatId,
      posterId: a,
      status: 'accepted',
      startsAt: new Date(now.getTime() - 3600_000),
      endsAt: now,
      acceptanceDeadline: new Date(now.getTime() - 7200_000),
      acceptedById: b,
      acceptedAt: new Date(now.getTime() - 7000_000),
      stakeAmountMinor: stakeMinor,
      currency: CUR,
      feeScheduleVersion: 1,
    });
    challengeIds.push(challengeId);
    const matchId = uuidv7();
    await db.insert(schema.matches).values({ id: matchId, challengeId, status: 'in_progress' });
    matchIds.push(matchId);
    const profiles = await db
      .select({ id: schema.gameProfiles.id, userId: schema.gameProfiles.userId })
      .from(schema.gameProfiles)
      .where(
        and(eq(schema.gameProfiles.gameId, gameId), inArray(schema.gameProfiles.userId, [a, b])),
      );
    const pid = (u: string) => profiles.find((p) => p.userId === u)!.id;
    await db.insert(schema.matchSides).values([
      { id: uuidv7(), matchId, userId: a, gameProfileId: pid(a), side: 0, isPoster: true },
      { id: uuidv7(), matchId, userId: b, gameProfileId: pid(b), side: 1, isAcceptor: true },
    ]);
    return { challengeId, matchId };
  }

  const event = (type: string, payload: Record<string, unknown>): OutboxEvent => ({
    id: uuidv7(),
    type,
    subjectId: String(payload.matchId ?? payload.challengeId),
    payload,
    createdAt: new Date(),
    processedAt: null,
  });

  const ruled = (
    matchId: string,
    a: string,
    b: string,
    round: 1 | 2,
    winner: string | null,
    ratingAction: 'apply' | 'reverse_and_apply' | 'reverse' | 'none',
    opts: { void?: boolean; disputeId?: string } = {},
  ) =>
    event('dispute.ruled', {
      disputeId: opts.disputeId ?? uuidv7(),
      matchId,
      gameId,
      round,
      outcome: opts.void ? 'void' : winner === a ? 'side0_win' : 'side1_win',
      previousOutcome: round === 2 ? 'side0_win' : null,
      winnerUserId: opts.void ? null : winner,
      loserUserId: opts.void ? null : winner === a ? b : a,
      draw: false,
      void: Boolean(opts.void),
      participants: [a, b],
      ratingAction,
      final: round === 2,
      ruledAt: new Date().toISOString(),
      resolutionMs: 1000,
    });

  const avail = (u: string) => ledger.balance({ type: 'user_available', owner: u }, CUR);
  const held = (u: string) => ledger.balance({ type: 'user_held', owner: u }, CUR);

  async function deposit(userId: string, amountMinor: number, eventId = uuidv7()) {
    const body = JSON.stringify({
      id: eventId,
      type: 'deposit.succeeded',
      data: { userId, currency: CUR, amountMinor },
    });
    const sig = signPayload(SECRET, body, Math.floor(Date.now() / 1000));
    return { result: await wallet.receiveWebhook('mock', body, sig), body, eventId };
  }

  async function flag(key: string, enabled: boolean, stage = '1') {
    const id = uuidv7();
    await db.insert(schema.featureFlags).values({ id, key, stage, jurisdiction: STATE, enabled });
    flagIds.push(id);
    flags.invalidate();
  }

  beforeAll(async () => {
    process.env.MOCK_PROVIDER_WEBHOOK_SECRET = SECRET;
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    ledger = moduleRef.get(LedgerService);
    wallet = moduleRef.get(WalletService);
    flags = moduleRef.get(FlagsService);
    registry = moduleRef.get(ProviderRegistry);
    const [game] = await db.select().from(schema.games).where(eq(schema.games.key, 'efootball'));
    gameId = game!.id;
    const [format] = await db
      .select()
      .from(schema.gameFormats)
      .where(eq(schema.gameFormats.gameId, gameId))
      .limit(1);
    formatId = format!.id;
    await db.insert(schema.feeRules).values({
      id: uuidv7(),
      version: 1,
      currency: CUR,
      params: { feeBps: 500 },
      active: true,
    });
    await db.insert(schema.stakeLimitRules).values([
      {
        id: uuidv7(),
        scope: 'tier',
        key: 'tier1_phone_verified',
        currency: CUR,
        maxStakeMinor: 100_000,
      },
      { id: uuidv7(), scope: 'tier', key: 'tier2_kyc', currency: CUR, maxStakeMinor: 1_000_000 },
    ]);
    await flag(`currency:${CUR}`, true);
  }, 60_000);

  afterAll(async () => {
    // Retried as a whole on a deadlock with the outbox relay (see test-fixtures/retry).
    await retryOnDeadlock(async () => {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL raise.allow_purge = 'on'`);
        await tx.delete(schema.ledgerHolds).where(eq(schema.ledgerHolds.currency, CUR));
        await tx.execute(sql`
        DELETE FROM ledger_entries WHERE transaction_id IN
          (SELECT id FROM ledger_transactions WHERE currency = ${CUR})`);
        await tx.execute(sql`
        DELETE FROM ledger_transactions WHERE currency = ${CUR} AND reverses_transaction_id IS NOT NULL`);
        await tx
          .delete(schema.ledgerTransactions)
          .where(eq(schema.ledgerTransactions.currency, CUR));
        await tx.delete(schema.ledgerAccounts).where(eq(schema.ledgerAccounts.currency, CUR));
        await tx
          .delete(schema.providerWebhookEvents)
          .where(sql`${schema.providerWebhookEvents.payload}->'data'->>'currency' = ${CUR}`);
        await tx.delete(schema.feeRules).where(eq(schema.feeRules.currency, CUR));
        await tx.delete(schema.stakeLimitRules).where(eq(schema.stakeLimitRules.currency, CUR));
        if (flagIds.length)
          await tx.delete(schema.featureFlags).where(inArray(schema.featureFlags.id, flagIds));
        if (matchIds.length) {
          await tx
            .delete(schema.outboxEvents)
            .where(inArray(schema.outboxEvents.subjectId, matchIds));
          await tx.delete(schema.matches).where(inArray(schema.matches.id, matchIds));
        }
      });
      if (challengeIds.length)
        await db.delete(schema.challenges).where(inArray(schema.challenges.id, challengeIds));
      if (userIds.length) {
        await db.delete(schema.limitSettings).where(inArray(schema.limitSettings.userId, userIds));
        await db.delete(schema.gameProfiles).where(inArray(schema.gameProfiles.userId, userIds));
        await db.delete(schema.users).where(inArray(schema.users.id, userIds));
      }
      delete process.env.MOCK_PROVIDER_WEBHOOK_SECRET;
    });
    await moduleRef?.close();
  }, 60_000);

  // ---------------------------------------------------------------- F13.1 ledger core
  describe('ledger core (F13.1)', () => {
    it('entries and transactions are immutable at the SQL level', async () => {
      const u = await player('immut');
      const { result } = await deposit(u, 1_000);
      expect(result.status).toBe('applied');
      const [entry] = await db
        .execute<{ id: string }>(
          sql`
        SELECT e.id FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id
        WHERE a.owner_id = ${u} LIMIT 1`,
        )
        .then((r) => r.rows);
      // Drizzle wraps driver errors ("Failed query: …"); the Postgres message is on `cause`.
      const pgError = (p: Promise<unknown>) =>
        p.then(
          () => 'no error',
          (e: { message?: string; cause?: { message?: string } }) =>
            String(e?.cause?.message ?? e?.message),
        );
      expect(
        await pgError(
          db.execute(sql`UPDATE ledger_entries SET amount_minor = 1 WHERE id = ${entry!.id}`),
        ),
      ).toMatch(/ledger_entries is append-only \(UPDATE rejected\)/);
      expect(
        await pgError(db.execute(sql`DELETE FROM ledger_entries WHERE id = ${entry!.id}`)),
      ).toMatch(/ledger_entries is append-only \(DELETE rejected\)/);
      expect(
        await pgError(
          db.execute(
            sql`UPDATE ledger_transactions SET kind = 'adjustment' WHERE currency = ${CUR}`,
          ),
        ),
      ).toMatch(/ledger_transactions is append-only \(UPDATE rejected\)/);
    });

    it('the database refuses an unbalanced transaction at commit', async () => {
      const u = await player('unbal');
      await deposit(u, 500);
      const [acct] = await db
        .select({ id: schema.ledgerAccounts.id })
        .from(schema.ledgerAccounts)
        .where(and(eq(schema.ledgerAccounts.ownerId, u), eq(schema.ledgerAccounts.currency, CUR)));
      await expect(
        db.transaction(async (tx) => {
          const txnId = uuidv7();
          await tx.insert(schema.ledgerTransactions).values({
            id: txnId,
            idempotencyKey: `raw:${txnId}`,
            kind: 'adjustment',
            currency: CUR,
            requestHash: 'x',
          });
          await tx.insert(schema.ledgerEntries).values({
            id: uuidv7(),
            transactionId: txnId,
            accountId: acct!.id,
            amountMinor: 7,
            currency: CUR,
          });
        }),
      ).rejects.toThrow();
      expect(await avail(u)).toBe(500);
    });

    it('idempotent postings: a replay returns the original; a changed replay is refused', async () => {
      const u = await player('idem');
      await deposit(u, 10_000);
      const key = `test:${uuidv7()}`;
      const req = {
        idempotencyKey: key,
        kind: 'hold' as const,
        currency: CUR,
        legs: [
          { account: { type: 'user_available' as const, owner: u }, amountMinor: -3_000 },
          { account: { type: 'user_held' as const, owner: u }, amountMinor: 3_000 },
        ],
      };
      const first = await ledger.post(req);
      const again = await ledger.post(req);
      expect(again).toEqual({ id: first.id, replayed: true });
      expect(await avail(u)).toBe(7_000);
      await expect(
        ledger.post({
          ...req,
          legs: [
            { ...req.legs[0]!, amountMinor: -4_000 },
            { ...req.legs[1]!, amountMinor: 4_000 },
          ],
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('concurrent holds on one balance never overdraw (row locking)', async () => {
      const u = await player('race');
      await deposit(u, 10_000);
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) =>
          ledger.post({
            idempotencyKey: `race:${u}:${i}`,
            kind: 'hold',
            currency: CUR,
            legs: [
              { account: { type: 'user_available', owner: u }, amountMinor: -1_000 },
              { account: { type: 'user_held', owner: u }, amountMinor: 1_000 },
            ],
          }),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
      expect(await avail(u)).toBe(0);
      expect(await held(u)).toBe(10_000);
    });
  });

  // ---------------------------------------------------------------- F13.2 provider + webhook
  describe('mock provider and webhooks (F13.2)', () => {
    it('replayed webhooks create no duplicate entries; bad signatures are refused', async () => {
      const u = await player('hook');
      const { body, eventId } = await deposit(u, 2_500);
      const replay = await wallet.receiveWebhook(
        'mock',
        body,
        signPayload(SECRET, body, Math.floor(Date.now() / 1000)),
      );
      expect(replay.status).toBe('duplicate');
      expect(await avail(u)).toBe(2_500);
      const txns = await db
        .select()
        .from(schema.ledgerTransactions)
        .where(eq(schema.ledgerTransactions.idempotencyKey, `provider:mock:${eventId}`));
      expect(txns).toHaveLength(1);

      await expect(
        wallet.receiveWebhook('mock', body, 't=1,v1=' + '0'.repeat(64)),
      ).rejects.toMatchObject({
        status: 401,
      });
      const tampered = body.replace('2500', '9999999');
      await expect(
        wallet.receiveWebhook(
          'mock',
          tampered,
          signPayload('wrong-secret-wrong-secret', tampered, Math.floor(Date.now() / 1000)),
        ),
      ).rejects.toMatchObject({ status: 401 });
      await expect(wallet.receiveWebhook('stripe', body, 'x')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('the provider registry resolves the mock in Stage 1, even with the live flag on', async () => {
      await flag('live_wallet_provider', true);
      expect((await registry.resolve(STATE)).name).toBe('mock');
      expect((await registry.resolve(null)).name).toBe('mock');
    });

    it('accept → hold, confirm → winner paid minus fee, books net to zero', async () => {
      const a = await player('stk_a');
      const b = await player('stk_b');
      await deposit(a, 50_000);
      await deposit(b, 50_000);
      const { challengeId, matchId } = await stakedMatch(a, b, 20_000);

      const accepted = event('challenge.accepted', { challengeId, acceptorId: b, matchId });
      await wallet.handle(accepted);
      await wallet.handle(accepted); // relay redelivery
      expect(await avail(a)).toBe(30_000);
      expect(await held(a)).toBe(20_000);
      expect(await held(b)).toBe(20_000);

      const confirmed = event('match.confirmed', {
        matchId,
        winnerUserId: a,
        loserUserId: b,
        draw: false,
      });
      await wallet.handle(confirmed);
      await wallet.handle(confirmed);
      // Pot 40,000 at 500 bps: fee 2,000, winner gets 38,000.
      expect(await avail(a)).toBe(30_000 + 38_000);
      expect(await avail(b)).toBe(30_000);
      expect(await held(a)).toBe(0);
      expect(await held(b)).toBe(0);
      expect(await ledger.balance({ type: 'platform_fee' }, CUR)).toBeGreaterThanOrEqual(2_000);
      const holds = await db
        .select()
        .from(schema.ledgerHolds)
        .where(eq(schema.ledgerHolds.matchId, matchId));
      expect(holds.map((h) => h.status)).toEqual(['released', 'released']);
    });

    it('an appeal that flips the ruling reverses the payout and pays the other player', async () => {
      const a = await player('app_a');
      const b = await player('app_b');
      await deposit(a, 10_000);
      await deposit(b, 10_000);
      const { challengeId, matchId } = await stakedMatch(a, b, 10_000);
      await wallet.handle(event('challenge.accepted', { challengeId, acceptorId: b, matchId }));
      const disputeId = uuidv7();
      await wallet.handle(ruled(matchId, a, b, 1, a, 'apply', { disputeId }));
      expect(await avail(a)).toBe(19_000);
      await wallet.handle(ruled(matchId, a, b, 2, b, 'reverse_and_apply', { disputeId }));
      expect(await avail(a)).toBe(0);
      expect(await avail(b)).toBe(19_000);
    });

    it('a void ruling or a cancelled match refunds both stakes without a fee', async () => {
      const a = await player('void_a');
      const b = await player('void_b');
      await deposit(a, 5_000);
      await deposit(b, 5_000);
      const m1 = await stakedMatch(a, b, 5_000);
      await wallet.handle(
        event('challenge.accepted', {
          challengeId: m1.challengeId,
          acceptorId: b,
          matchId: m1.matchId,
        }),
      );
      await wallet.handle(ruled(m1.matchId, a, b, 1, null, 'none', { void: true }));
      expect(await avail(a)).toBe(5_000);
      expect(await avail(b)).toBe(5_000);

      const m2 = await stakedMatch(a, b, 5_000);
      await wallet.handle(
        event('challenge.accepted', {
          challengeId: m2.challengeId,
          acceptorId: b,
          matchId: m2.matchId,
        }),
      );
      await wallet.handle(event('match.cancelled', { matchId: m2.matchId }));
      expect(await avail(a)).toBe(5_000);
      expect(await held(b)).toBe(0);
    });

    it('settles even if the result is processed before the hold (relay retry order)', async () => {
      const a = await player('ord_a');
      const b = await player('ord_b');
      await deposit(a, 1_000);
      await deposit(b, 1_000);
      const { matchId } = await stakedMatch(a, b, 1_000);
      await wallet.handle(
        event('match.confirmed', { matchId, winnerUserId: b, loserUserId: a, draw: false }),
      );
      expect(await avail(b)).toBe(1_900);
      expect(await held(a)).toBe(0);
    });

    it('Stage 1 zero-stake challenges take the same path and post nothing', async () => {
      const a = await player('free_a');
      const b = await player('free_b');
      const { challengeId, matchId } = await stakedMatch(a, b, 0);
      await wallet.handle(event('challenge.accepted', { challengeId, acceptorId: b, matchId }));
      await wallet.handle(
        event('match.confirmed', { matchId, winnerUserId: a, loserUserId: b, draw: false }),
      );
      const holds = await db
        .select()
        .from(schema.ledgerHolds)
        .where(eq(schema.ledgerHolds.matchId, matchId));
      expect(holds).toHaveLength(2);
      expect(
        holds.every((h) => h.amountMinor === 0 && h.status === 'released' && !h.holdTransactionId),
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------- F13.3 / F13.4
  describe('stake caps and jurisdiction flags (F13.3, F13.4)', () => {
    it('caps by tier are enforced while stakes are still off; the flag turns money on per state', async () => {
      const low = await player('cap_low');
      const kyc = await player('cap_kyc', 'tier2_kyc');
      expect(await wallet.checkStake(low, 0, CUR)).toMatchObject({ ok: true });
      expect(await wallet.checkStake(low, 100_001, CUR)).toMatchObject({
        ok: false,
        code: 'above_cap',
      });
      expect(await wallet.checkStake(low, 50_000, CUR)).toMatchObject({
        ok: false,
        code: 'real_money_disabled',
      });
      expect(await wallet.checkStake(kyc, 500_000, CUR)).toMatchObject({
        ok: false,
        code: 'real_money_disabled',
      });

      await flag('real_money_stakes', true);
      expect(await wallet.checkStake(low, 50_000, CUR)).toMatchObject({
        ok: true,
        capMinor: 100_000,
      });
      expect(await wallet.checkStake(kyc, 500_000, CUR)).toMatchObject({ ok: true });
      expect(await wallet.checkStake(low, 100_001, CUR)).toMatchObject({ code: 'above_cap' });
    });

    it('a currency not enabled for the state is refused; Stage 1 seeds keep NGN on, money off', async () => {
      const u = await player('cur');
      expect(await wallet.checkStake(u, 0, 'XZZ')).toMatchObject({
        ok: false,
        code: 'currency_not_allowed',
      });
      expect(await flags.isEnabled('currency:NGN', { jurisdiction: 'Lagos' })).toBe(true);
      expect(
        await flags.isEnabled('real_money_stakes', { jurisdiction: 'Lagos', stage: '2' }),
      ).toBe(false);
      expect(await flags.isEnabled('real_money_stakes', { jurisdiction: 'Lagos' })).toBe(false);
    });

    it('self-exclusion takes any stake to zero', async () => {
      const u = await player('excl');
      await db.insert(schema.limitSettings).values({
        userId: u,
        selfExcludedUntil: new Date(Date.now() + 7 * 24 * 3600_000),
      });
      expect(await wallet.checkStake(u, 1, CUR)).toMatchObject({
        ok: false,
        code: 'self_excluded',
      });
    });
  });

  // ---------------------------------------------------------------- F13.5 + invariants
  it('matches carry a nullable competition id (Stage 3 slot)', async () => {
    const a = await player('comp_a');
    const b = await player('comp_b');
    const { matchId } = await stakedMatch(a, b, 0);
    const [m] = await db
      .select({ c: schema.matches.competitionId })
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId));
    expect(m!.c).toBeNull();
  });

  it('the nightly check passes: every currency nets to zero and caches match the entries', async () => {
    const report = await ledger.checkInvariants();
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    const [sum] = await db
      .execute<{ total: string }>(
        sql`SELECT coalesce(sum(amount_minor), 0)::text AS total FROM ledger_entries WHERE currency = ${CUR}`,
      )
      .then((r) => r.rows);
    expect(Number(sum!.total)).toBe(0);
  });
});
