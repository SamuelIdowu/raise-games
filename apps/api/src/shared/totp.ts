import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238 over RFC 4226 HOTP), HMAC-SHA1, 30-second steps, 6 digits — what every
 * authenticator app speaks. Hand-rolled on node:crypto (≈40 lines) rather than adding a
 * dependency to the admin security surface; pinned by the RFC's own test vectors.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SEC = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret (RFC 4226 §4 recommends ≥128 bits), base32 for authenticator apps. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(key: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', key).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code =
    ((mac[offset]! & 0x7f) << 24) |
    (mac[offset + 1]! << 16) |
    (mac[offset + 2]! << 8) |
    mac[offset + 3]!;
  return (code % 10 ** digits).toString().padStart(digits, '0');
}

export function totpAt(secretB32: string, atMs: number, digits = TOTP_DIGITS): string {
  return hotp(base32Decode(secretB32), Math.floor(atMs / 1000 / TOTP_STEP_SEC), digits);
}

/**
 * Accepts the current step and one either side (clock drift). Returns the matched step
 * so callers can refuse replays of the same code (`lastStep`).
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  nowMs: number = Date.now(),
  lastStep: number | null = null,
): { ok: true; step: number } | { ok: false } {
  if (!/^\d{6}$/.test(code)) return { ok: false };
  const key = base32Decode(secretB32);
  const current = Math.floor(nowMs / 1000 / TOTP_STEP_SEC);
  for (const step of [current - 1, current, current + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    const expected = Buffer.from(hotp(key, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return { ok: true, step };
  }
  return { ok: false };
}

export function otpauthUri(secretB32: string, account: string, issuer = 'RAISE'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SEC}`;
}
