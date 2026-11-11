import { describe, it, expect } from 'vitest';
import { buildRefreshToken, maskPhone, parseRefreshToken, parseTtl } from './auth.utils';

describe('parseTtl', () => {
  it('parses seconds', () => expect(parseTtl('45s')).toBe(45_000));
  it('parses minutes', () => expect(parseTtl('15m')).toBe(900_000));
  it('parses days', () => expect(parseTtl('30d')).toBe(2_592_000_000));
  it('rejects malformed values', () => expect(() => parseTtl('15')).toThrow('Cannot parse TTL'));
});

describe('maskPhone', () => {
  it('keeps a 5/2 window and hides the middle', () => {
    expect(maskPhone('+2348031234567')).toBe('+2348****67');
  });
});

describe('refresh tokens', () => {
  it('round-trips the session id', () => {
    const sessionId = '018f8c2e-1b2a-7c3d-8e4f-123456789abc';
    const parsed = parseRefreshToken(buildRefreshToken(sessionId));
    expect(parsed?.sessionId).toBe(sessionId);
  });

  it('rejects tokens without a separator', () => {
    expect(parseRefreshToken('abcdef')).toBeNull();
  });

  it('rejects malformed session ids', () => {
    expect(parseRefreshToken('not-a-uuid:secret')).toBeNull();
  });

  it('rejects empty secrets', () => {
    expect(parseRefreshToken('018f8c2e-1b2a-7c3d-8e4f-123456789abc:')).toBeNull();
  });
});
