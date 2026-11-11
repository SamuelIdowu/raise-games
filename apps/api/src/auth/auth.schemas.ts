import { z } from 'zod';
import { phoneSchema } from '@raise/schemas';

export const otpRequestSchema = z.object({
  phone: phoneSchema,
  turnstileToken: z.string().optional(),
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export type OtpRequest = z.infer<typeof otpRequestSchema>;
export type OtpVerify = z.infer<typeof otpVerifySchema>;
export type RefreshRequest = z.infer<typeof refreshSchema>;
