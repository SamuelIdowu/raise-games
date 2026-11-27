import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Provider webhook signatures (F13.2). Header format, modelled on common provider schemes:
 *
 *   Raise-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
 *
 * The timestamp is signed, and requests outside the tolerance are refused, so a captured
 * request cannot be replayed later with a fresh timestamp. Replays inside the window are
 * caught by the (provider, event id) unique key.
 */
export const SIGNATURE_HEADER = 'raise-signature';
export const SIGNATURE_TOLERANCE_SEC = 300;

export function signPayload(secret: string, rawBody: string, timestampSec: number): string {
  const mac = createHmac('sha256', secret).update(`${timestampSec}.${rawBody}`).digest('hex');
  return `t=${timestampSec},v1=${mac}`;
}

export type SignatureCheck =
  { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'mismatch' };

export function verifySignature(
  secret: string,
  rawBody: string,
  header: string | undefined,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = SIGNATURE_TOLERANCE_SEC,
): SignatureCheck {
  if (!header) return { ok: false, reason: 'missing' };
  const parts = new Map(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
    }),
  );
  const t = Number(parts.get('t'));
  const v1 = parts.get('v1');
  if (!Number.isInteger(t) || !v1 || !/^[0-9a-f]{64}$/.test(v1)) {
    return { ok: false, reason: 'malformed' };
  }
  if (Math.abs(nowSec - t) > toleranceSec) return { ok: false, reason: 'stale' };
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const given = Buffer.from(v1, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
}
