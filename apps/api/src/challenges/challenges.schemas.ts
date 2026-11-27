import { z } from 'zod';

/** Most players one group challenge can be offered to. */
export const MAX_GROUP_TARGETS = 10;

export const boardQuerySchema = z.object({
  game: z.string().min(1).max(64).optional(),
  status: z.enum(['open', 'all']).default('open'),
  mine: z.enum(['true', 'false']).optional(),
  /** Direct challenges addressed to the viewer (F6.4 needs-action list). */
  forMe: z.enum(['true', 'false']).optional(),
  campus: z.string().min(1).max(64).optional(),
  city: z.string().min(1).max(64).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  stakeBand: z.string().optional(),
});

export type BoardQuery = z.infer<typeof boardQuerySchema>;

export const createChallengeSchema = z
  .object({
    gameKey: z.string().min(1).max(64),
    formatKey: z.string().min(1).max(64),
    rules: z.string().min(1).max(2000).optional().default(''),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    targetPlayerId: z.uuid().optional(),
    /**
     * Group challenge: offered to these players only; the first to accept plays. One id is
     * treated as a direct challenge. Not combined with targetPlayerId.
     */
    targetPlayerIds: z
      .array(z.uuid())
      .min(1)
      .max(MAX_GROUP_TARGETS)
      .refine((ids) => new Set(ids).size === ids.length, 'Each player can be added once')
      .optional(),
    /** Idempotency key for safe retries. */
    idempotencyKey: z.uuid().optional(),
    /**
     * Sprint 13: stake in minor units + ISO 4217 currency. Zero in Stage 1 (real money is
     * flag-gated per jurisdiction); tier caps are still enforced, which proves the wiring.
     */
    stakeAmountMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('NGN'),
  })
  .refine((b) => !(b.targetPlayerId && b.targetPlayerIds), {
    message: 'Send either targetPlayerId or targetPlayerIds, not both',
    path: ['targetPlayerIds'],
  });

type ParsedCreateChallenge = z.infer<typeof createChallengeSchema>;
/** Stake fields are optional for internal callers; the service defaults them (0, NGN). */
export type CreateChallengeRequest = Omit<ParsedCreateChallenge, 'stakeAmountMinor' | 'currency'> &
  Partial<Pick<ParsedCreateChallenge, 'stakeAmountMinor' | 'currency'>>;

export const challengeIdParamSchema = z.object({
  id: z.uuid(),
});

export type ChallengeIdParam = z.infer<typeof challengeIdParamSchema>;
