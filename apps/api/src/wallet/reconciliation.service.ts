import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';

/** Grace period before an unfinished money step counts as stuck. */
export const RECONCILE_GRACE = '1 hour';

export type ReconciliationIssue =
  | { kind: 'webhook_unposted'; provider: string; eventId: string }
  | { kind: 'webhook_stuck'; provider: string; eventId: string; outcome: string | null }
  | { kind: 'hold_unsettled'; holdId: string; matchId: string; matchStatus: string }
  | { kind: 'hold_missing_transaction'; holdId: string; status: string };

export interface ReconciliationReport {
  ok: boolean;
  checkedAt: string;
  issues: ReconciliationIssue[];
}

/**
 * Ledger reconciliation (audit B30; PRD "Early technical foundations": "…a reconciliation
 * job"; TA: provider webhooks "reconciled daily").
 *
 * The nightly invariant check proves the books balance internally. This proves they agree
 * with what happened outside them:
 *
 * - every provider callback recorded as applied has its ledger posting;
 * - no callback sits unprocessed, or failed, past the grace period;
 * - no stake is still held after its match ended (a missed release or refund);
 * - every non-zero hold and settlement points at the ledger transaction that moved it.
 *
 * Stage 2 adds a comparison against the provider's own statement here. Read-only; issues
 * are logged as `ledger.reconciliation` and counted by the ops `ledger_imbalance` alert.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  async reconcile(): Promise<ReconciliationReport> {
    const issues: ReconciliationIssue[] = [];
    const grace = sql.raw(`interval '${RECONCILE_GRACE}'`);

    const unposted = await db.execute<{ provider: string; event_id: string }>(sql`
      SELECT w.provider, w.event_id
      FROM provider_webhook_events w
      WHERE w.outcome = 'applied'
        AND NOT EXISTS (
          SELECT 1 FROM ledger_transactions t
          WHERE t.reference_type = 'provider_event' AND t.reference_id = w.event_id)`);
    for (const r of unposted.rows) {
      issues.push({ kind: 'webhook_unposted', provider: r.provider, eventId: r.event_id });
    }

    const stuck = await db.execute<{ provider: string; event_id: string; outcome: string | null }>(
      sql`
      SELECT provider, event_id, outcome
      FROM provider_webhook_events
      WHERE (processed_at IS NULL AND received_at < now() - ${grace})
         OR outcome LIKE 'failed%'`,
    );
    for (const r of stuck.rows) {
      issues.push({
        kind: 'webhook_stuck',
        provider: r.provider,
        eventId: r.event_id,
        outcome: r.outcome,
      });
    }

    const unsettled = await db.execute<{ id: string; match_id: string; status: string }>(sql`
      SELECT h.id, h.match_id, m.status
      FROM ledger_holds h
      JOIN matches m ON m.id = h.match_id
      WHERE h.status = 'held'
        AND m.status IN ('confirmed', 'resolved', 'cancelled', 'expired', 'forfeited', 'voided')
        AND m.updated_at < now() - ${grace}`);
    for (const r of unsettled.rows) {
      issues.push({
        kind: 'hold_unsettled',
        holdId: r.id,
        matchId: r.match_id,
        matchStatus: r.status,
      });
    }

    // Zero-stake holds (all of Stage 1) post nothing, so they carry no transaction.
    const missing = await db.execute<{ id: string; status: string }>(sql`
      SELECT id, status FROM ledger_holds
      WHERE amount_minor <> 0
        AND (hold_transaction_id IS NULL
          OR (status IN ('released', 'refunded') AND settle_transaction_id IS NULL))`);
    for (const r of missing.rows) {
      issues.push({ kind: 'hold_missing_transaction', holdId: r.id, status: r.status });
    }

    const report = { ok: issues.length === 0, checkedAt: new Date().toISOString(), issues };
    if (!report.ok) {
      this.logger.error({ event: 'ledger.reconciliation', issues }, 'ledger reconciliation failed');
    }
    return report;
  }
}
