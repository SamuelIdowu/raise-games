export const FEATURE_FLAGS = {
  // Restricted DMs are not here: they follow the server flag `messaging.dm` (Sprint 14,
  // decision 0007), read through dmApi.status() / useDmEnabled().
  /** Play-credit rehearsal — owner decision pending for Stage 1 */
  playCredits: false,
} as const;
