/**
 * PII scrubbing for anything that leaves the API for a third party (Sprint 15, F15.4):
 * error reports, client error forwarding, analytics properties. NDPA: phone numbers and
 * emails are personal data; tokens and OTP codes are secrets.
 */

const PATTERNS: Array<[RegExp, string]> = [
  // Bearer tokens and JWTs (three base64url segments).
  [/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[jwt]'],
  // Refresh tokens: "<sessionId>.<secret>" built by buildRefreshToken.
  [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{20,}\b/gi,
    '[token]',
  ],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  // Phone numbers: international (+234 803 …) and Nigerian mobile (0803 123 4567), with
  // optional spaces or dashes. Not inside a longer token, so UUIDs and ids survive.
  [/(?<![\w-])\+\d(?:[\s-]?\d){9,14}(?![\w-])/g, '[phone]'],
  [/(?<![\w-])0[789][01]\d(?:[\s-]?\d){7}(?![\w-])/g, '[phone]'],
];

/** Keys whose values are always dropped, whatever they contain. */
const SECRET_KEYS =
  /^(authorization|cookie|password|code|otp|token|accesstoken|refreshtoken|secret|phone|email|mfasecret.*|turnstiletoken)$/i;

export function scrubString(value: string): string {
  let out = value;
  for (const [re, replacement] of PATTERNS) out = out.replace(re, replacement);
  return out;
}

export function scrub<T>(value: T, depth = 0): T {
  if (depth > 8) return '[depth]' as T;
  if (typeof value === 'string') return scrubString(value) as T;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? '[redacted]' : scrub(v, depth + 1);
    }
    return out as T;
  }
  return value;
}
