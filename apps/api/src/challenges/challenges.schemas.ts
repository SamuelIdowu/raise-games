import { z } from 'zod';

export const boardQuerySchema = z.object({
  game: z.string().min(1).max(64).optional(),
  status: z.enum(['open', 'all']).default('open'),
  mine: z.enum(['true', 'false']).optional(),
  campus: z.string().min(1).max(64).optional(),
  city: z.string().min(1).max(64).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  stakeBand: z.string().optional(),
});

export type BoardQuery = z.infer<typeof boardQuerySchema>;

export const createChallengeSchema = z.object({
  gameKey: z.string().min(1).max(64),
  formatKey: z.string().min(1).max(64),
  rules: z.string().min(1).max(2000).optional().default(''),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  targetPlayerId: z.uuid().optional(),
  /** Idempotency key for safe retries. */
  idempotencyKey: z.uuid().optional(),
});

export type CreateChallengeRequest = z.infer<typeof createChallengeSchema>;

export const challengeIdParamSchema = z.object({
  id: z.uuid(),
});

export type ChallengeIdParam = z.infer<typeof challengeIdParamSchema>;
