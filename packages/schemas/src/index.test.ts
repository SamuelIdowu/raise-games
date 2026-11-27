import { describe, it, expect } from 'vitest';
import {
  normalizeNigerianPhone,
  phoneError,
  phoneSchema,
  usernameError,
  usernameSchema,
} from './index';

describe('normalizeNigerianPhone', () => {
  it('normalizes local leading-zero format', () => {
    expect(normalizeNigerianPhone('08031234567')).toBe('+2348031234567');
  });

  it('normalizes spaced/dashed inputs', () => {
    expect(normalizeNigerianPhone('(0803) 123-4567')).toBe('+2348031234567');
  });

  it('raises +234 already-normalized', () => {
    expect(normalizeNigerianPhone('+2348031234567')).toBe('+2348031234567');
  });

  it('raises 234 without plus', () => {
    expect(normalizeNigerianPhone('2348031234567')).toBe('+2348031234567');
  });

  it('rejects wrong length', () => {
    expect(normalizeNigerianPhone('0803123456')).toBeNull();
    expect(normalizeNigerianPhone('080312345678')).toBeNull();
  });
});

describe('phoneSchema', () => {
  it('transforms through zod', () => {
    const parsed = phoneSchema.parse('0803 123 4567');
    expect(parsed).toBe('+2348031234567');
  });
});

describe('phoneError', () => {
  it('accepts Nigerian mobile numbers in any common format', () => {
    for (const ok of ['0803 123 4567', '07012345678', '+2349112345678', '2348101234567']) {
      expect(phoneError(ok)).toBeNull();
    }
  });

  it('explains what is wrong', () => {
    expect(phoneError('')).toBe('Enter your phone number');
    expect(phoneError('0803abc4567')).toBe('Use digits only');
    expect(phoneError('080312345')).toBe('That number is too short');
    expect(phoneError('080312345678')).toBe('That number is too long');
    expect(phoneError('01234567890')).toMatch(/mobile number/);
  });

  it('rejects landlines through the schema', () => {
    expect(phoneSchema.safeParse('01234567890').success).toBe(false);
  });
});

describe('usernameError', () => {
  it('accepts ordinary names', () => {
    for (const ok of ['ade', 'ade_plays', 'Player1', 'x_9_y']) expect(usernameError(ok)).toBeNull();
  });

  it('rejects bad formats with a reason', () => {
    expect(usernameError('ab')).toMatch(/at least 3/);
    expect(usernameError('a'.repeat(21))).toMatch(/at most 20/);
    expect(usernameError('ade plays')).toMatch(/letters, numbers/);
    expect(usernameError('12345')).toMatch(/one letter/);
    expect(usernameError('_ade')).toMatch(/underscore/);
    expect(usernameError('ade_')).toMatch(/underscore/);
    expect(usernameError('a__b')).toMatch(/two underscores/);
  });

  it('blocks reserved names in any case', () => {
    expect(usernameError('Admin')).toMatch(/reserved/);
    expect(usernameError('RAISE')).toMatch(/reserved/);
  });

  it('trims through the schema', () => {
    expect(usernameSchema.parse('  ade  ')).toBe('ade');
  });
});
