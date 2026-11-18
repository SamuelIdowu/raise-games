import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { LedgerService } from '../ledger/ledger.service';
import { OutboxRelay } from '../realtime/outbox-relay';
import {
  type Alert,
  DISPUTE_SLA_MS,
  NOTIFICATION_WINDOW_MS,
  type OpsSnapshot,
  evaluate,
  transitions,
} from './alert-rules';

/**
 * Collects the ops snapshot, evaluates the alert rules, and announces changes (F15.5).
 *
 * Alert contract: one structured log line per announcement,
 *   { event: 'alert', status: 'firing' | 'resolved', rule, severity, summary, value, threshold }
 * which the log platform turns into pages; plus a JSON POST to ALERT_WEBHOOK_URL when set
 * (e.g. a Slack incoming webhook). De-duplication state is in memory per instance; the
 * job scheduler runs the check on one instance at a time.
 */
@Injectable()
export class OpsService {
  private readonly logger = new Logger('Alerts');
  private state = new Map<string, number>();

  constructor(
    private readonly relay: OutboxRelay,
    private readonly ledger: LedgerService,
  ) {}

  async snapshot(now = new Date()): Promise<OpsSnapshot> {
    const since = new Date(now.getTime() - NOTIFICATION_WINDOW_MS);
    const slaCutoff = new Date(now.getTime() - DISPUTE_SLA_MS);
    const [row] = (
      await db.execute<{
        stuck: number;
        attempts: number;
        failures: number;
        dead: number;
        over_sla: number;
      }>(sql`
        SELECT
          (SELECT count(*)::int FROM matches WHERE
              (status = 'awaiting_confirmation' AND confirmation_deadline < now() - interval '5 minutes')
           OR (status IN ('accepted','in_progress','awaiting_result') AND result_deadline < now())) AS stuck,
          (SELECT count(*)::int FROM delivery_attempts
             WHERE channel <> 'in_app' AND status IN ('sent','failed') AND created_at >= ${since}) AS attempts,
          (SELECT count(*)::int FROM delivery_attempts
             WHERE channel <> 'in_app' AND status = 'failed' AND created_at >= ${since}) AS failures,
          (SELECT count(*)::int FROM outbox_deliveries WHERE status = 'dead') AS dead,
          (SELECT count(*)::int FROM disputes
             WHERE status IN ('open','reviewed','appealed') AND created_at < ${slaCutoff}) AS over_sla
      `)
    ).rows;

    const outboxLagMs: Record<string, number> = {};
    for (const consumer of this.relay.consumerNames()) {
      // Oldest event within the relay's lookback this consumer has not settled.
      const [lag] = (
        await db.execute<{ oldest: Date | null }>(sql`
          SELECT min(e.created_at) AS oldest
          FROM outbox_events e
          LEFT JOIN outbox_deliveries d ON d.event_id = e.id AND d.consumer = ${consumer}
          WHERE e.created_at > now() - interval '7 days'
            AND (d.event_id IS NULL OR d.status = 'retry')`)
      ).rows;
      outboxLagMs[consumer] = lag?.oldest ? now.getTime() - new Date(lag.oldest).getTime() : 0;
    }

    const ledger = await this.ledger.checkInvariants();
    return {
      stuckMatches: Number(row?.stuck ?? 0),
      notificationAttempts: Number(row?.attempts ?? 0),
      notificationFailures: Number(row?.failures ?? 0),
      outboxLagMs,
      outboxDead: Number(row?.dead ?? 0),
      disputesOverSla: Number(row?.over_sla ?? 0),
      ledgerIssues: ledger.issues.length,
    };
  }

  /** One check: evaluate, announce new/repeating alerts and resolutions. */
  async check(
    now = new Date(),
  ): Promise<{ firing: Alert[]; announced: Alert[]; resolved: string[] }> {
    const firing = evaluate(await this.snapshot(now));
    const t = transitions(firing, this.state, now.getTime());
    this.state = t.next;
    for (const a of t.announce) await this.announce({ status: 'firing', ...a });
    for (const rule of t.resolved) await this.announce({ status: 'resolved', rule });
    return { firing, announced: t.announce, resolved: t.resolved };
  }

  private async announce(payload: Record<string, unknown>): Promise<void> {
    const line = { event: 'alert', ...payload };
    if (payload.status === 'firing') this.logger.error(line);
    else this.logger.log(line);
    const url = process.env.ALERT_WEBHOOK_URL;
    if (!url) return;
    try {
      const text =
        payload.status === 'firing'
          ? `[${String(payload.severity).toUpperCase()}] ${String(payload.summary)}`
          : `[RESOLVED] ${String(payload.rule)}`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, ...line }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      this.logger.warn(`alert webhook failed: ${(error as Error).message}`);
    }
  }
}
