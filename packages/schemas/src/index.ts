import { z } from 'zod';

export function normalizeNigerianPhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, '');
  if (/^\+234\d{10}$/.test(digits)) return digits;
  if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^234\d{10}$/.test(digits)) return `+${digits}`;
  return null;
}

export const phoneSchema = z.string().transform((val, ctx) => {
  const normalized = normalizeNigerianPhone(val);
  if (!normalized) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid Nigerian phone number' });
    return z.NEVER;
  }
  return normalized;
});

export type PhoneValue = z.infer<typeof phoneSchema>;
