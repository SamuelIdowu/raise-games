import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { cursorSchemas, decodeCursor, encodeCursor } from './cursor';

const ID = '01a21d66-cc1d-70cf-beea-823e197e0386';
const AT = '2026-11-13T10:00:00.000Z';
const raw = (v: unknown) => Buffer.from(JSON.stringify(v), 'utf8').toString('base64url');

describe('cursor', () => {
  it('round-trips each shape the API encodes', () => {
    expect(
      decodeCursor(encodeCursor({ createdAt: AT, id: ID }), cursorSchemas.createdAtId),
    ).toEqual({ createdAt: AT, id: ID });
    expect(decodeCursor(encodeCursor({ t: AT, id: ID }), cursorSchemas.timeId)).toEqual({
      t: AT,
      id: ID,
    });
    expect(decodeCursor(encodeCursor({ id: ID }), cursorSchemas.id)).toEqual({ id: ID });
    expect(decodeCursor(encodeCursor({ rating: 1234, id: ID }), cursorSchemas.ratingId)).toEqual({
      rating: 1234,
      id: ID,
    });
    expect(decodeCursor(encodeCursor({ p: 40 }), cursorSchemas.position)).toEqual({ p: 40 });
  });

  it('returns null when no cursor is supplied', () => {
    expect(decodeCursor(undefined, cursorSchemas.timeId)).toBeNull();
  });

  it('rejects input that is not base64 JSON', () => {
    expect(() => decodeCursor('not-a-cursor', cursorSchemas.timeId)).toThrow(BadRequestException);
  });

  it('rejects valid JSON in the wrong shape (the 500 the audit reproduced)', () => {
    const bad = [
      ['nope'],
      { createdAt: 'x', id: 'y' },
      { createdAt: AT, id: 'not-a-uuid' },
      { createdAt: AT },
      { t: 12, id: ID },
    ];
    for (const v of bad) {
      expect(() => decodeCursor(raw(v), cursorSchemas.createdAtId)).toThrow(BadRequestException);
      expect(() => decodeCursor(raw(v), cursorSchemas.timeId)).toThrow(BadRequestException);
    }
    expect(() => decodeCursor(raw({ rating: '1e9', id: ID }), cursorSchemas.ratingId)).toThrow(
      BadRequestException,
    );
    expect(() => decodeCursor(raw({ p: -1 }), cursorSchemas.position)).toThrow(BadRequestException);
    expect(() => decodeCursor(raw({ p: 'x' }), cursorSchemas.position)).toThrow(
      BadRequestException,
    );
  });
});
