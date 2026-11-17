/**
 * Responsible-gaming limit rules (Sprint 13, F13.5; TA LimitSetting). Pure.
 *
 * - Lowering a limit, or setting one where there was none, applies immediately.
 * - Raising or removing a limit waits out a cooling-off period, so a decision made in the
 *   moment cannot loosen it at once.
 * - Self-exclusion can be extended but never shortened or lifted early.
 */
export const COOLING_OFF_MS = 24 * 3600_000;

export type LimitPeriod = 'daily' | 'weekly' | 'monthly';
export type Limits = Record<LimitPeriod, number | null>;

export interface LimitState {
  limits: Limits;
  pending: Partial<Limits> | null;
  pendingEffectiveAt: Date | null;
  selfExcludedUntil: Date | null;
}

export interface LimitChange {
  limits?: Partial<Limits>;
  selfExcludeDays?: number;
}

/** A null limit means "no limit", i.e. infinitely loose. */
function looser(next: number | null, current: number | null): boolean {
  if (next === null) return current !== null;
  if (current === null) return false;
  return next > current;
}

/** Applies a pending loosening once its cooling-off period has passed. */
export function settlePending(state: LimitState, now: Date): LimitState {
  if (!state.pending || !state.pendingEffectiveAt || state.pendingEffectiveAt > now) return state;
  return {
    ...state,
    limits: { ...state.limits, ...state.pending },
    pending: null,
    pendingEffectiveAt: null,
  };
}

export function applyChange(state: LimitState, change: LimitChange, now: Date): LimitState {
  let next = settlePending(state, now);
  const immediate: Partial<Limits> = {};
  const delayed: Partial<Limits> = { ...(next.pending ?? {}) };

  for (const [period, value] of Object.entries(change.limits ?? {}) as Array<
    [LimitPeriod, number | null]
  >) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
      throw new RangeError('Limits are whole, non-negative amounts');
    }
    if (looser(value, next.limits[period])) {
      delayed[period] = value;
    } else {
      immediate[period] = value;
      delete delayed[period]; // a tighter limit cancels a pending loosening
    }
  }
  const hasDelayed = Object.keys(delayed).length > 0;
  const newlyDelayed = Object.keys(change.limits ?? {}).some((p) => p in delayed);
  next = {
    ...next,
    limits: { ...next.limits, ...immediate },
    pending: hasDelayed ? delayed : null,
    pendingEffectiveAt: hasDelayed
      ? newlyDelayed
        ? new Date(now.getTime() + COOLING_OFF_MS)
        : next.pendingEffectiveAt
      : null,
  };

  if (change.selfExcludeDays !== undefined) {
    if (!Number.isInteger(change.selfExcludeDays) || change.selfExcludeDays < 1) {
      throw new RangeError('Self-exclusion is at least one day');
    }
    const until = new Date(now.getTime() + change.selfExcludeDays * 24 * 3600_000);
    if (!next.selfExcludedUntil || until > next.selfExcludedUntil) {
      next = { ...next, selfExcludedUntil: until };
    }
  }
  return next;
}
