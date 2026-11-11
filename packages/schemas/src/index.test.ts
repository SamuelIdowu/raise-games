import { describe, it, expect } from 'vitest';
import { normalizeNigerianPhone, phoneSchema } from './index';

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
