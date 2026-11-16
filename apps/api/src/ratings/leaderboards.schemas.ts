import { z } from 'zod';

export const leaderboardParamSchema = z.object({ gameKey: z.string().min(1).max(64) });
export type LeaderboardParam = z.infer<typeof leaderboardParamSchema>;

export const leaderboardQuerySchema = z.object({
  campus: z.string().trim().min(1).max(64).optional(),
  city: z.string().trim().min(1).max(64).optional(),
  /** Period filter is a placeholder (F10.3: seasons later); only all-time exists. */
  period: z.enum(['all_time']).default('all_time'),
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
