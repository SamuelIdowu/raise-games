/**
 * Sanction ladder and fraud auto-limits (Sprint 12, F12.3/F12.4). Pure, unit-tested.
 * Numbers: docs/decisions/0005-sanctions-and-escalation.md.
 *
 * PRD ladder: warning → 7-day suspension → 30-day suspension → permanent ban.
 */

export type SanctionType = 'warning' | 'suspension' | 'temporary_ban' | 'permanent_ban';
export type LadderStep = 1 | 2 | 3 | 4;

export interface StepSpec {
  step: LadderStep;
  type: SanctionType;
  /** null = no end (permanent). 0 = instant (a warning is on record, never "active"). */
  durationMs: number | null;
  label: string;
}

const DAY = 86_400_000;

export const LADDER: Record<LadderStep, StepSpec> = {
  1: { step: 1, type: 'warning', durationMs: 0, label: 'Warning' },
  2: { step: 2, type: 'suspension', durationMs: 7 * DAY, label: '7-day suspension' },
  3: { step: 3, type: 'suspension', durationMs: 30 * DAY, label: '30-day suspension' },
  4: { step: 4, type: 'permanent_ban', durationMs: null, label: 'Permanent ban' },
};

/** Earlier steps count for a year; a clean year resets the ladder. */
export const LADDER_MEMORY_MS = 365 * DAY;

/** Next rung: one above the highest un-revoked step in the last year, capped at a ban. */
export function nextStep(priorSteps: number[]): LadderStep {
  const top = priorSteps.reduce((m, s) => Math.max(m, s), 0);
  return Math.min(4, top + 1) as LadderStep;
}

export function windowFor(step: LadderStep, now: Date): { startsAt: Date; endsAt: Date | null } {
  const spec = LADDER[step];
  return {
    startsAt: now,
    endsAt: spec.durationMs === null ? null : new Date(now.getTime() + spec.durationMs),
  };
}

/** What a sanction stops. Suspended players keep their account (and can finish matches). */
export function restrictionsOf(type: SanctionType | null) {
  return {
    loginBlocked: type === 'permanent_ban' || type === 'temporary_ban',
    playBlocked: type === 'suspension' || type === 'permanent_ban' || type === 'temporary_ban',
  };
}

/** Player-facing summary (Design §9: plain, no shaming; Sprint 11 `sanction_applied`). */
export function sanctionSummary(step: LadderStep, endsAt: Date | null): string {
  if (step === 1) return 'You received a warning. Please review the community rules.';
  if (step === 4) return 'Your account has been closed for breaking the community rules.';
  const until = endsAt
    ? endsAt.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Africa/Lagos',
      })
    : '';
  return `You cannot create or accept challenges until ${until}. You can still finish your current matches.`;
}

// ---------------------------------------------------------------- auto-limits

export const ESCALATION_WINDOW_MS = 30 * DAY;

export const ESCALATION_RULES = {
  /** Exact-reuse screenshot rejections (Sprint 8). */
  reusedScreenshots: 2,
  /** Reports against the player that a moderator actioned. */
  actionedReports: 3,
  /** Disputes the player opened and lost (F9.4 incentive guard). */
  disputesLostAsOpener: 3,
  /** Late cancels and no-show forfeits (reputation debts). */
  reputationDebts: 3,
} as const;

export type EscalationSignal = keyof typeof ESCALATION_RULES;
export type EscalationCounts = Record<EscalationSignal, number>;

/**
 * "Dead-man switch": crossing any threshold in the window limits the account (no new
 * challenges) until a moderator reviews and clears it. It never bans on its own.
 */
export function evaluateEscalation(counts: EscalationCounts): {
  limited: boolean;
  reasons: EscalationSignal[];
} {
  const reasons = (Object.keys(ESCALATION_RULES) as EscalationSignal[]).filter(
    (k) => counts[k] >= ESCALATION_RULES[k],
  );
  return { limited: reasons.length > 0, reasons };
}
