/**
 * Operational alert rules (Sprint 15, F15.5). Pure: the ops check gathers a snapshot and
 * these decide what is firing. PRD: "alerts fire on stuck matches and failed
 * notifications"; TA adds ledger imbalance. Every threshold is a named constant with a
 * boundary test.
 */

export const THRESHOLDS = {
  /** Any match past its deadline (same definition as the moderator dashboard). */
  stuckMatches: 1,
  /** Share of push/email delivery attempts that failed in the window. */
  notificationFailureRate: 0.05,
  /** Below this many attempts the rate is noise; alert on absolute failures instead. */
  notificationMinAttempts: 20,
  notificationFailuresAbsolute: 5,
  /** Oldest outbox event a consumer has not settled. */
  outboxLagMs: 2 * 60_000,
  /** Events a consumer gave up on (retries exhausted). */
  outboxDead: 1,
  /** Disputes open past the 24h moderation SLA (PRD: median resolution under 24h). */
  disputesOverSla: 1,
  /** Any ledger invariant issue is a page (decision 0006). */
  ledgerIssues: 1,
} as const;

export const NOTIFICATION_WINDOW_MS = 15 * 60_000;
export const DISPUTE_SLA_MS = 24 * 3600_000;

export type Severity = 'sev1' | 'sev2';

export interface OpsSnapshot {
  stuckMatches: number;
  notificationAttempts: number;
  notificationFailures: number;
  /** Age in ms of the oldest unsettled event, per consumer. */
  outboxLagMs: Record<string, number>;
  outboxDead: number;
  disputesOverSla: number;
  ledgerIssues: number;
}

export interface Alert {
  rule: string;
  severity: Severity;
  summary: string;
  value: number;
  threshold: number;
}

export function evaluate(s: OpsSnapshot): Alert[] {
  const out: Alert[] = [];

  if (s.stuckMatches >= THRESHOLDS.stuckMatches) {
    out.push({
      rule: 'stuck_matches',
      severity: 'sev2',
      summary: `${s.stuckMatches} match(es) past their deadline`,
      value: s.stuckMatches,
      threshold: THRESHOLDS.stuckMatches,
    });
  }

  const rate = s.notificationAttempts > 0 ? s.notificationFailures / s.notificationAttempts : 0;
  const enough = s.notificationAttempts >= THRESHOLDS.notificationMinAttempts;
  if (
    (enough && rate > THRESHOLDS.notificationFailureRate) ||
    (!enough && s.notificationFailures >= THRESHOLDS.notificationFailuresAbsolute)
  ) {
    out.push({
      rule: 'notification_failures',
      severity: 'sev2',
      summary: `${s.notificationFailures}/${s.notificationAttempts} push/email deliveries failed in 15 min`,
      value: enough ? rate : s.notificationFailures,
      threshold: enough
        ? THRESHOLDS.notificationFailureRate
        : THRESHOLDS.notificationFailuresAbsolute,
    });
  }

  for (const [consumer, lag] of Object.entries(s.outboxLagMs)) {
    if (lag > THRESHOLDS.outboxLagMs) {
      out.push({
        rule: `outbox_lag:${consumer}`,
        // Match state, ratings and holds all ride the outbox: a stalled relay is a sev1.
        severity: 'sev1',
        summary: `Outbox consumer "${consumer}" is ${Math.round(lag / 1000)}s behind`,
        value: lag,
        threshold: THRESHOLDS.outboxLagMs,
      });
    }
  }

  if (s.outboxDead >= THRESHOLDS.outboxDead) {
    out.push({
      rule: 'outbox_dead',
      severity: 'sev2',
      summary: `${s.outboxDead} outbox event(s) gave up after retries`,
      value: s.outboxDead,
      threshold: THRESHOLDS.outboxDead,
    });
  }

  if (s.disputesOverSla >= THRESHOLDS.disputesOverSla) {
    out.push({
      rule: 'dispute_backlog',
      severity: 'sev2',
      summary: `${s.disputesOverSla} dispute(s) open past the 24h SLA`,
      value: s.disputesOverSla,
      threshold: THRESHOLDS.disputesOverSla,
    });
  }

  if (s.ledgerIssues >= THRESHOLDS.ledgerIssues) {
    out.push({
      rule: 'ledger_imbalance',
      severity: 'sev1',
      summary: `${s.ledgerIssues} ledger invariant issue(s)`,
      value: s.ledgerIssues,
      threshold: THRESHOLDS.ledgerIssues,
    });
  }

  return out;
}

/**
 * De-duplication (one notice per rule per hour while firing, plus "resolved" once it
 * clears). `state` maps rule → last time it was announced; the caller persists it.
 */
export const REPEAT_MS = 3600_000;

export function transitions(
  firing: Alert[],
  state: Map<string, number>,
  now: number,
): { announce: Alert[]; resolved: string[]; next: Map<string, number> } {
  const next = new Map(state);
  const announce: Alert[] = [];
  for (const a of firing) {
    const last = state.get(a.rule);
    if (last === undefined || now - last >= REPEAT_MS) {
      announce.push(a);
      next.set(a.rule, now);
    }
  }
  const firingRules = new Set(firing.map((a) => a.rule));
  const resolved = [...state.keys()].filter((r) => !firingRules.has(r));
  for (const r of resolved) next.delete(r);
  return { announce, resolved, next };
}
