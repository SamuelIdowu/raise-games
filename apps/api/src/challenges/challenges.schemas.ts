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
