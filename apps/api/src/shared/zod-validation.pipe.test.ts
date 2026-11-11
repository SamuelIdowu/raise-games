import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({ name: z.string().min(2) });
const pipe = new ZodValidationPipe(schema);

describe('ZodValidationPipe', () => {
  it('returns parsed data for valid input', () => {
    const meta = { type: 'body' } as const;
    expect(pipe.transform({ name: 'okay' }, meta)).toEqual({ name: 'okay' });
  });

  it('throws BadRequestException with field details for invalid input', () => {
    const meta = { type: 'body' } as const;
    try {
      pipe.transform({ name: 'x' }, meta);
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toContain('name');
    }
  });
});
