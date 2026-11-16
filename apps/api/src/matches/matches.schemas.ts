import { z } from 'zod';

const note = z.string().trim().max(200).optional();

export const submitResultSchema = z.object({
  outcome: z.enum(['win', 'loss', 'draw']),
  /** Shape is checked against the format's score model in the service (spec §2). */
  score: z.unknown(),
  uploadId: z.uuid().optional(),
  note,
  idempotencyKey: z.uuid(),
});
export type SubmitResultRequest = z.infer<typeof submitResultSchema>;

export const reportNoShowSchema = z.object({
  /** Proof of attempt is mandatory (PRD). */
  uploadId: z.uuid(),
  note,
  idempotencyKey: z.uuid(),
});
export type ReportNoShowRequest = z.infer<typeof reportNoShowSchema>;

export const confirmResultSchema = z.object({
  idempotencyKey: z.uuid(),
});
export type ConfirmResultRequest = z.infer<typeof confirmResultSchema>;

export const matchIdParamSchema = z.object({ id: z.uuid() });
export type MatchIdParam = z.infer<typeof matchIdParamSchema>;

export const listMatchesQuerySchema = z.object({
  scope: z.enum(['active', 'finished', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListMatchesQuery = z.infer<typeof listMatchesQuerySchema>;
