import {
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { db, schema } from '../db/client';
import type { Tx } from '../db/tx';
import {
  type AccountKey,
  type Leg,
  type PostingRequest,
  LedgerRuleError,
  accountRef,
  allowsNegative,
  normalisePosting,
  requestHash,
  reversalLegs,
} from './ledger.math';

export interface PostedTransaction {
  id: string;
  /** True when this call matched an earlier posting with the same idempotency key. */
  replayed: boolean;
}

export interface InvariantReport {
  ok: boolean;
  checkedAt: string;
  issues: Array<
    | { kind: 'currency_not_zero'; currency: string; sumMinor: number }
    | { kind: 'transaction_unbalanced'; transactionId: string; sumMinor: number }
    | { kind: 'balance_cache_drift'; accountId: string; cachedMinor: number; entriesMinor: number }
    | { kind: 'negative_balance'; accountId: string; balanceMinor: number }
  >;
}

/**
 * Double-entry ledger (Sprint 13, F13.1; TA §Ledger).
 *
 * - Entries are immutable (DB trigger); corrections are `reversal` transactions.
 * - Every posting carries an idempotency key. A replay with the same contents returns the
 *   original transaction; a replay with different contents is refused (409).
 * - Accounts are locked `FOR UPDATE` in id order before any balance changes, so concurrent
 *   postings serialise per account and cannot deadlock on lock order.
 * - The database also checks, at commit, that each transaction sums to zero in one
 *   currency, and that no non-clearing balance goes negative.
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  /** Posts in the caller's transaction, or in a new one. */
  async post(req: PostingRequest, tx?: Tx): Promise<PostedTransaction> {
    return tx ? this.postIn(tx, req) : db.transaction((t) => this.postIn(t, req));
  }

  /** Reverses a posting once. Idempotent on `idempotencyKey`. */
  async reverse(
    transactionId: string,
    idempotencyKey: string,
    tx?: Tx,
  ): Promise<PostedTransaction> {
    const run = async (t: Tx) => {
      const [orig] = await t
        .select()
        .from(schema.ledgerTransactions)
        .where(eq(schema.ledgerTransactions.id, transactionId));
      if (!orig) throw new UnprocessableEntityException('No such ledger transaction');
      const entries = await t
        .select({
          amountMinor: schema.ledgerEntries.amountMinor,
          accountType: schema.ledgerAccounts.accountType,
          ownerId: schema.ledgerAccounts.ownerId,
          accountRef: schema.ledgerAccounts.accountRef,
        })
        .from(schema.ledgerEntries)
        .innerJoin(
          schema.ledgerAccounts,
          eq(schema.ledgerAccounts.id, schema.ledgerEntries.accountId),
        )
        .where(eq(schema.ledgerEntries.transactionId, transactionId));
      const legs: Leg[] = entries.map((e) => ({
        account: keyFromRow(e.accountType as AccountKey['type'], e.ownerId, e.accountRef),
        amountMinor: e.amountMinor,
      }));
      return this.postIn(
        t,
        {
          idempotencyKey,
          kind: 'reversal',
          currency: orig.currency,
          legs: reversalLegs(legs),
          reference: { type: 'ledger_transaction', id: transactionId },
        },
        transactionId,
      );
    };
    return tx ? run(tx) : db.transaction(run);
  }

  /** Current balance of one logical account (0 if it was never used). */
  async balance(key: AccountKey, currency: string, tx?: Tx): Promise<number> {
    const [row] = await (tx ?? db)
      .select({ balance: schema.ledgerAccounts.balanceMinor })
      .from(schema.ledgerAccounts)
      .where(
        and(
          eq(schema.ledgerAccounts.accountRef, accountRef(key)),
          eq(schema.ledgerAccounts.currency, currency),
        ),
      );
    return row?.balance ?? 0;
  }

  /**
   * The nightly invariant check (TA: "a nightly check confirms all ledger accounts net to
   * zero"). Also proves the cached balances equal the entries and that no transaction or
   * guarded balance is out of shape. Read-only.
   */
  async checkInvariants(): Promise<InvariantReport> {
    const issues: InvariantReport['issues'] = [];

    const currencies = await db.execute<{ currency: string; total: string }>(sql`
      SELECT currency, sum(amount_minor)::text AS total
      FROM ledger_entries GROUP BY currency HAVING sum(amount_minor) <> 0`);
    for (const r of currencies.rows) {
      issues.push({ kind: 'currency_not_zero', currency: r.currency, sumMinor: Number(r.total) });
    }

    const unbalanced = await db.execute<{ transaction_id: string; total: string }>(sql`
      SELECT transaction_id, sum(amount_minor)::text AS total
      FROM ledger_entries GROUP BY transaction_id HAVING sum(amount_minor) <> 0`);
    for (const r of unbalanced.rows) {
      issues.push({
        kind: 'transaction_unbalanced',
        transactionId: r.transaction_id,
        sumMinor: Number(r.total),
      });
    }

    const drift = await db.execute<{ id: string; cached: string; entries: string }>(sql`
      SELECT a.id, a.balance_minor::text AS cached, coalesce(sum(e.amount_minor), 0)::text AS entries
      FROM ledger_accounts a LEFT JOIN ledger_entries e ON e.account_id = a.id
      GROUP BY a.id
      HAVING a.balance_minor <> coalesce(sum(e.amount_minor), 0)`);
    for (const r of drift.rows) {
      issues.push({
        kind: 'balance_cache_drift',
        accountId: r.id,
        cachedMinor: Number(r.cached),
        entriesMinor: Number(r.entries),
      });
    }

    const negative = await db.execute<{ id: string; balance: string }>(sql`
      SELECT id, balance_minor::text AS balance FROM ledger_accounts
      WHERE NOT allow_negative AND balance_minor < 0`);
    for (const r of negative.rows) {
      issues.push({ kind: 'negative_balance', accountId: r.id, balanceMinor: Number(r.balance) });
    }

    const report = { ok: issues.length === 0, checkedAt: new Date().toISOString(), issues };
    if (!report.ok) {
      // M4 alert contract: a structured error line with this event name pages on-call.
      this.logger.error({ event: 'ledger.imbalance', issues }, 'ledger invariant check failed');
    }
    return report;
  }

  // ---------------------------------------------------------------- internals

  private async postIn(
    tx: Tx,
    req: PostingRequest,
    reversesTransactionId?: string,
  ): Promise<PostedTransaction> {
    let legs: Leg[];
    try {
      legs = normalisePosting(req);
    } catch (error) {
      if (error instanceof LedgerRuleError) throw new UnprocessableEntityException(error.message);
      throw error;
    }
    const hash = requestHash(req, legs);

    const replay = await this.findReplay(tx, req.idempotencyKey, hash);
    if (replay) return replay;

    // Resolve accounts, then lock them in id order before touching any balance.
    const accounts = new Map<string, { id: string; balance: number; allowNegative: boolean }>();
    for (const leg of legs) {
      const id = await this.ensureAccount(tx, leg.account, req.currency);
      accounts.set(accountRef(leg.account), { id, balance: 0, allowNegative: false });
    }
    const ids = [...accounts.values()].map((a) => a.id).sort();
    const locked = await tx
      .select({
        id: schema.ledgerAccounts.id,
        ref: schema.ledgerAccounts.accountRef,
        balance: schema.ledgerAccounts.balanceMinor,
        allowNegative: schema.ledgerAccounts.allowNegative,
      })
      .from(schema.ledgerAccounts)
      .where(inArray(schema.ledgerAccounts.id, ids))
      .orderBy(asc(schema.ledgerAccounts.id))
      .for('update');
    for (const row of locked) {
      accounts.set(row.ref, { id: row.id, balance: row.balance, allowNegative: row.allowNegative });
    }

    // A concurrent duplicate may have committed while we waited for the locks.
    const raced = await this.findReplay(tx, req.idempotencyKey, hash);
    if (raced) return raced;

    for (const leg of legs) {
      const a = accounts.get(accountRef(leg.account))!;
      if (a.balance + leg.amountMinor < 0 && !a.allowNegative) {
        throw new UnprocessableEntityException(`Insufficient funds in ${accountRef(leg.account)}`);
      }
    }

    const id = uuidv7();
    const [inserted] = await tx
      .insert(schema.ledgerTransactions)
      .values({
        id,
        idempotencyKey: req.idempotencyKey,
        kind: req.kind,
        currency: req.currency,
        referenceType: req.reference?.type ?? null,
        referenceId: req.reference?.id ?? null,
        reversesTransactionId: reversesTransactionId ?? null,
        requestHash: hash,
      })
      .onConflictDoNothing({ target: schema.ledgerTransactions.idempotencyKey })
      .returning({ id: schema.ledgerTransactions.id });
    if (!inserted) {
      const again = await this.findReplay(tx, req.idempotencyKey, hash);
      if (again) return again;
      throw new ConflictException('Ledger idempotency conflict');
    }

    await tx.insert(schema.ledgerEntries).values(
      legs.map((leg) => ({
        id: uuidv7(),
        transactionId: id,
        accountId: accounts.get(accountRef(leg.account))!.id,
        amountMinor: leg.amountMinor,
        currency: req.currency,
      })),
    );
    for (const leg of legs) {
      await tx
        .update(schema.ledgerAccounts)
        .set({
          balanceMinor: sql`${schema.ledgerAccounts.balanceMinor} + ${leg.amountMinor}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.ledgerAccounts.id, accounts.get(accountRef(leg.account))!.id));
    }
    return { id, replayed: false };
  }

  private async findReplay(
    tx: Tx,
    idempotencyKey: string,
    hash: string,
  ): Promise<PostedTransaction | null> {
    const [existing] = await tx
      .select({ id: schema.ledgerTransactions.id, hash: schema.ledgerTransactions.requestHash })
      .from(schema.ledgerTransactions)
      .where(eq(schema.ledgerTransactions.idempotencyKey, idempotencyKey));
    if (!existing) return null;
    if (existing.hash !== hash) {
      throw new ConflictException('Idempotency key reused with a different posting');
    }
    return { id: existing.id, replayed: true };
  }

  private async ensureAccount(tx: Tx, key: AccountKey, currency: string): Promise<string> {
    const ref = accountRef(key);
    await tx
      .insert(schema.ledgerAccounts)
      .values({
        id: uuidv7(),
        accountRef: ref,
        accountType: key.type,
        ownerId: key.type.startsWith('user_') ? key.owner! : null,
        currency,
        allowNegative: allowsNegative(key.type),
      })
      .onConflictDoNothing({
        target: [schema.ledgerAccounts.accountRef, schema.ledgerAccounts.currency],
      });
    const [row] = await tx
      .select({ id: schema.ledgerAccounts.id })
      .from(schema.ledgerAccounts)
      .where(
        and(
          eq(schema.ledgerAccounts.accountRef, ref),
          eq(schema.ledgerAccounts.currency, currency),
        ),
      );
    return row!.id;
  }
}

function keyFromRow(type: AccountKey['type'], ownerId: string | null, ref: string): AccountKey {
  if (type === 'user_available' || type === 'user_held') return { type, owner: ownerId! };
  if (type === 'provider_clearing') return { type, owner: ref.split(':')[1] };
  return { type };
}
