import { z } from 'zod';

export const matchChatParamSchema = z.object({ matchId: z.uuid() });
export type MatchChatParam = z.infer<typeof matchChatParamSchema>;

export const messageParamSchema = z.object({ matchId: z.uuid(), messageId: z.uuid() });
export type MessageParam = z.infer<typeof messageParamSchema>;

export const userParamSchema = z.object({ userId: z.uuid() });
export type UserParam = z.infer<typeof userParamSchema>;

export const listMessagesQuerySchema = z.object({
  before: z.string().min(1).max(200).optional(),
  after: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

/**
 * Body length is checked again after normalisation in chat.rules (code points, 500).
 * The raw cap here only stops oversized payloads early.
 */
export const sendMessageSchema = z.object({
  body: z.string().max(4000),
  /** Client-generated id; retries reuse it so a resend never duplicates. */
  clientMsgId: z.uuid(),
});
export type SendMessageRequest = z.infer<typeof sendMessageSchema>;

export const reportMessageSchema = z.object({
  reason: z.enum(['harassment', 'hate', 'spam', 'cheating', 'off_platform', 'other']),
  note: z.string().trim().max(500).optional(),
});
export type ReportMessageRequest = z.infer<typeof reportMessageSchema>;
