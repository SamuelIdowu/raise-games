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
export const logoutSchema = z.object({ refreshToken: z.string().min(1) });

export const updateMeSchema = z
  .object({
    displayName: z
      .string()
      .min(3)
      .max(20)
      .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores allowed')
      .optional(),
    jurisdictionState: z.string().min(1).max(64).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export type OtpRequest = z.infer<typeof otpRequestSchema>;
export type OtpVerify = z.infer<typeof otpVerifySchema>;
export type RefreshRequest = z.infer<typeof refreshSchema>;
export type LogoutRequest = z.infer<typeof logoutSchema>;
export type UpdateMe = z.infer<typeof updateMeSchema>;
