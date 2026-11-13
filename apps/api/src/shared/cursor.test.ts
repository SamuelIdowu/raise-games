import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  it('round-trips a payload', () => {
    const encoded = encodeCursor({ createdAt: '2026-11-13T10:00:00.000Z', id: 'abc' });
    expect(decodeCursor(encoded)).toEqual({ createdAt: '2026-11-13T10:00:00.000Z', id: 'abc' });
  });

  it('returns null when no cursor is supplied', () => {
    expect(decodeCursor(undefined)).toBeNull();
  });

  it('rejects malformed cursors', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(BadRequestException);
  });

  it('rejects cursors that are not objects', () => {
    const encoded = Buffer.from(JSON.stringify(['nope']), 'utf8').toString('base64url');
    expect(() => decodeCursor(encoded)).toThrow(BadRequestException);
  });
});
