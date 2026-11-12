import { z } from 'zod';
import type { ConsentType } from './consent.constants';

export const consentTypeSchema = z.enum(['terms', 'privacy'] as [ConsentType, ...ConsentType[]]);

export const acceptConsentSchema = z.object({
  termsType: consentTypeSchema,
  termsVersion: z.string().min(1).max(32),
});

export const statusSchema = z.object({
  current: z.object({
    terms: z.string(),
    privacy: z.string(),
  }),
  accepted: z.object({
    terms: z.boolean(),
    privacy: z.boolean(),
  }),
  playAllowed: z.boolean(),
});

export type AcceptConsent = z.infer<typeof acceptConsentSchema>;
export type ConsentStatus = z.infer<typeof statusSchema>;
