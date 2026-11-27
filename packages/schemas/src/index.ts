import { z } from 'zod';

export function normalizeNigerianPhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, '');
  if (/^\+234\d{10}$/.test(digits)) return digits;
  if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^234\d{10}$/.test(digits)) return `+${digits}`;
  return null;
}

export const phoneSchema = z.string().transform((val, ctx) => {
  const message = phoneError(val);
  if (message) {
    ctx.addIssue({ code: 'custom', message });
    return z.NEVER;
  }
  return normalizeNigerianPhone(val)!;
});

export type PhoneValue = z.infer<typeof phoneSchema>;

/** Nigerian mobile numbers start 070, 080, 081, 090 or 091 (after the leading 0). */
const NG_MOBILE = /^\+234[789][01]\d{8}$/;

/**
 * Why a phone entry can't be used yet, or null when it is a valid Nigerian mobile number.
 * Shared by the sign-in form (live feedback) and the API (phoneSchema).
 */
export function phoneError(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return 'Enter your phone number';
  if (/[^\d\s()+-]/.test(trimmed)) return 'Use digits only';
  const normalized = normalizeNigerianPhone(trimmed);
  if (!normalized) {
    const digits = trimmed.replace(/\D/g, '');
    const local = digits.startsWith('234') ? digits.length - 3 : digits.length - 1;
    if (local < 10) return 'That number is too short';
    if (local > 10) return 'That number is too long';
    return 'Enter a valid Nigerian phone number';
  }
  if (!NG_MOBILE.test(normalized))
    return 'Enter a Nigerian mobile number (070, 080, 081, 090 or 091)';
  return null;
}

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** Names nobody can take: they would read as staff, the platform or a page. Compared lowercased. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'api',
  'help',
  'me',
  'mod',
  'moderator',
  'null',
  'official',
  'raise',
  'raise_games',
  'raiseapp',
  'raise_official',
  'root',
  'settings',
  'staff',
  'support',
  'system',
  'team',
  'undefined',
]);

/**
 * Why a username can't be used, or null when its format is fine (availability is a separate
 * server check). Rules: 3–20 characters; letters, numbers and underscores; at least one
 * letter; no underscore at the start or end, and no two in a row; not a reserved name.
 */
export function usernameError(input: string): string | null {
  const name = input.trim();
  if (!name) return 'Choose a username';
  if (name.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters`;
  if (name.length > USERNAME_MAX) return `Use at most ${USERNAME_MAX} characters`;
  if (!/^[a-zA-Z0-9_]+$/.test(name)) return 'Only letters, numbers and underscores';
  if (!/[a-zA-Z]/.test(name)) return 'Include at least one letter';
  if (name.startsWith('_') || name.endsWith('_')) return 'Can’t start or end with an underscore';
  if (name.includes('__')) return 'No two underscores in a row';
  if (RESERVED_USERNAMES.has(name.toLowerCase())) return 'That username is reserved';
  return null;
}

export const usernameSchema = z
  .string()
  .trim()
  .superRefine((val, ctx) => {
    const message = usernameError(val);
    if (message) ctx.addIssue({ code: 'custom', message });
  });
