import { z } from 'zod';
import { RANK_TIERS } from '@raise/types';

export const playerSearchSchema = z.object({
  game: z.string().min(1).max(64).optional(),
  rank: z.enum(RANK_TIERS).optional(),
  campus: z.string().min(1).max(64).optional(),
  city: z.string().min(1).max(64).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type PlayerSearchQuery = z.infer<typeof playerSearchSchema>;
