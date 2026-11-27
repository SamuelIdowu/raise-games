import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export type CursorPayload = Record<string, string | number>;

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** Every id the API pages by is a UUID column; anything else would reach Postgres and 500. */
const id = z.guid();
const at = z.iso.datetime();

/**
 * The cursor shapes the API hands out. A cursor is client-supplied, so it is parsed against
 * the shape its endpoint encodes: a forged or truncated one is a 400, never a 500 from
 * `new Date('x')` or a bad uuid in SQL (pre-deploy audit 2026-11-27).
 */
export const cursorSchemas = {
  /** Challenge board: newest first. */
  createdAtId: z.object({ createdAt: at, id }),
  /** Chat, DMs, notifications, admin queues and audit log. */
  timeId: z.object({ t: at, id }),
  /** Admin user search, ordered by id. */
  id: z.object({ id }),
  /** Player search, highest rating first. */
  ratingId: z.object({ rating: z.number().int(), id }),
  /** Leaderboard position offset. */
  position: z.object({ p: z.number().int().min(0).max(10_000_000) }),
} as const;

export function decodeCursor<S extends z.ZodType>(
  raw: string | undefined,
  schema: S,
): z.infer<S> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new BadRequestException('Invalid cursor');
  return result.data;
}
