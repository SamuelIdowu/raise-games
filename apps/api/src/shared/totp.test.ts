import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  hotp,
  otpauthUri,
  totpAt,
  verifyTotp,
  generateTotpSecret,
} from './totp';
import { open, seal, secretBoxKey } from './secret-box';

// RFC 6238 Appendix B: SHA-1 seed "12345678901234567890" (ASCII), 8 digits.
const RFC_SEED = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('TOTP (RFC 6238 test vectors)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('T=%i → %s', (t, code) => {
    expect(totpAt(RFC_SEED, t * 1000, 8)).toBe(code);
  });

  it('matches RFC 4226 HOTP vectors (6 digits)', () => {
    const key = Buffer.from('12345678901234567890', 'ascii');
    expect([0, 1, 2, 9].map((c) => hotp(key, c))).toEqual(['755224', '287082', '359152', '520489']);
  });
});

describe('verifyTotp', () => {
  const secret = generateTotpSecret();
  const now = 1_800_000_000_000;

  it('accepts the current code and ±1 step for clock drift', () => {
    expect(verifyTotp(secret, totpAt(secret, now), now).ok).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, now - 30_000), now).ok).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, now + 30_000), now).ok).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, now - 90_000), now).ok).toBe(false);
  });

  it('refuses malformed codes and replays of an already-used step', () => {
    expect(verifyTotp(secret, '12345', now).ok).toBe(false);
    expect(verifyTotp(secret, 'abcdef', now).ok).toBe(false);
    const first = verifyTotp(secret, totpAt(secret, now), now);
    expect(first.ok).toBe(true);
    const step = first.ok ? first.step : 0;
    expect(verifyTotp(secret, totpAt(secret, now), now, step).ok).toBe(false);
  });

  it('round-trips base32 and builds an otpauth URI', () => {
    const buf = Buffer.from('hello raise');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    expect(otpauthUri(secret, 'mod_ada')).toMatch(
      /^otpauth:\/\/totp\/RAISE%3Amod_ada\?secret=[A-Z2-7]+&issuer=RAISE/,
    );
  });
});

describe('secret box', () => {
  const env = { JWT_ACCESS_SECRET: 'x'.repeat(40), NODE_ENV: 'test' };

  it('seals and opens; tampering fails', () => {
    const key = secretBoxKey(env);
    const sealed = seal(key, 'JBSWY3DPEHPK3PXP');
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(open(key, sealed)).toBe('JBSWY3DPEHPK3PXP');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => open(key, parts.join('.'))).toThrow();
  });

  it('requires a dedicated key outside development/test', () => {
    expect(() => secretBoxKey({ ...env, NODE_ENV: 'production' })).toThrow(/MFA_ENCRYPTION_KEY/);
    const key = Buffer.alloc(32, 7).toString('base64');
    expect(secretBoxKey({ ...env, NODE_ENV: 'production', MFA_ENCRYPTION_KEY: key }).length).toBe(
      32,
    );
  });
});
