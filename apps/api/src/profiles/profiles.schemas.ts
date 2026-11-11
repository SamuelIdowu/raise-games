import { z } from 'zod';

export const upsertProfileSchema = z.object({
  gameKey: z.string().min(1),
  inGameId: z.string().min(1).max(64),
  city: z.string().min(1).max(64).optional(),
  campus: z.string().min(1).max(64).optional(),
});

export type UpsertProfile = z.infer<typeof upsertProfileSchema>;
