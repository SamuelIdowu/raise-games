/** Kept free of zod and games.json so the web bundle can import it (Design §11 budget). */
export interface ResultSchema {
  outcomeOptions: ('win' | 'loss' | 'draw')[];
  scoreModel: 'goals' | 'kills' | 'placement' | 'points';
  drawAllowed: boolean;
}

/**
 * Result validation shared by the API (authoritative) and the web steppers.
 * Spec: docs/sprints/sprint-08-spec.md §2.
 *
 * Score payload is always from the submitter's point of view and has exactly
 * two integer keys: `self` and `opponent`.
 */

export type ScoreModel = ResultSchema['scoreModel'];
export type ResultOutcome = 'win' | 'loss' | 'draw';

export interface ScoreBounds {
  min: number;
  max: number;
  /** `higher`: more is better (goals, kills, points). `lower`: placement. */
  better: 'higher' | 'lower';
  label: string;
}

export const SCORE_BOUNDS: Record<ScoreModel, ScoreBounds> = {
  goals: { min: 0, max: 99, better: 'higher', label: 'Goals' },
  kills: { min: 0, max: 999, better: 'higher', label: 'Kills' },
  points: { min: 0, max: 9999, better: 'higher', label: 'Points' },
  placement: { min: 1, max: 100, better: 'lower', label: 'Placement' },
};

export interface ScorePayload {
  self: number;
  opponent: number;
}

/** Exactly `{ self, opponent }`, both integers; nothing else. */
export function parseScorePayload(raw: unknown): ScorePayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== 2 || !keys.includes('self') || !keys.includes('opponent')) return null;
  const { self, opponent } = raw as Record<string, unknown>;
  if (!Number.isInteger(self) || !Number.isInteger(opponent)) return null;
  return { self: self as number, opponent: opponent as number };
}

export type ResultValidationError =
  | 'score_keys'
  | 'score_out_of_bounds'
  | 'draw_not_allowed'
  | 'outcome_not_allowed'
  | 'outcome_score_mismatch';

export type ResultValidation = { ok: true } | { ok: false; error: ResultValidationError };

/** -1: self is worse, 0: equal, 1: self is better. */
export function compareScore(model: ScoreModel, score: ScorePayload): -1 | 0 | 1 {
  if (score.self === score.opponent) return 0;
  const selfHigher = score.self > score.opponent;
  const better = SCORE_BOUNDS[model].better === 'higher' ? selfHigher : !selfHigher;
  return better ? 1 : -1;
}

export function validateResult(
  resultSchema: ResultSchema,
  outcome: ResultOutcome,
  rawScore: unknown,
): ResultValidation {
  const score = parseScorePayload(rawScore);
  if (!score) return { ok: false, error: 'score_keys' };

  const bounds = SCORE_BOUNDS[resultSchema.scoreModel];
  for (const value of [score.self, score.opponent]) {
    if (value < bounds.min || value > bounds.max)
      return { ok: false, error: 'score_out_of_bounds' };
  }

  if (outcome === 'draw') {
    if (!resultSchema.drawAllowed) return { ok: false, error: 'draw_not_allowed' };
  } else if (!resultSchema.outcomeOptions.includes(outcome)) {
    return { ok: false, error: 'outcome_not_allowed' };
  }

  const cmp = compareScore(resultSchema.scoreModel, score);
  // Tiebreak rules: if scores are equal, the submitted win/loss stands.
  if (outcome === 'win' && cmp < 0) return { ok: false, error: 'outcome_score_mismatch' };
  if (outcome === 'loss' && cmp > 0) return { ok: false, error: 'outcome_score_mismatch' };
  if (outcome === 'draw' && cmp !== 0) return { ok: false, error: 'outcome_score_mismatch' };

  return { ok: true };
}

/** Plain-language messages for each validation error (Design §9 voice). */
export const RESULT_ERROR_MESSAGES: Record<ResultValidationError, string> = {
  score_keys: 'Enter a score for both players.',
  score_out_of_bounds: 'That score is outside the allowed range for this game.',
  draw_not_allowed: 'This format does not allow draws.',
  outcome_not_allowed: 'That outcome is not available for this format.',
  outcome_score_mismatch: 'The score does not match the outcome you picked.',
};
