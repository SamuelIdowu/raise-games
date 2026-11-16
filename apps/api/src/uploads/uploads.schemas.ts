import { z } from 'zod';

export const presignUploadSchema = z.object({
  matchId: z.uuid(),
  purpose: z.enum(['result_proof', 'no_show_proof']),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
});
export type PresignUploadRequest = z.infer<typeof presignUploadSchema>;

export const uploadIdParamSchema = z.object({ id: z.uuid() });
export type UploadIdParam = z.infer<typeof uploadIdParamSchema>;

export const uploadUrlQuerySchema = z.object({
  variant: z.enum(['full', 'thumb']).default('full'),
});
export type UploadUrlQuery = z.infer<typeof uploadUrlQuerySchema>;
