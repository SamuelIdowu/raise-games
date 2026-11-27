import { ensureRedis, redis } from '../cache/redis';

/**
 * Chat send limits. Unlike shared/rate-limit.ts (which lets traffic through when Redis
 * is down — fine for the board), chat is an abuse surface, so when Redis is unavailable
 * this falls back to a per-instance in-memory window instead of no limit at all.
 */
export const CHAT_LIMITS = [
  { name: 'burst', max: 8, windowMs: 10_000 },
  { name: 'hour', max: 300, windowMs: 3_600_000 },
] as const;

const memory = new Map<string, { count: number; resetAt: number }>();

function memoryHit(key: string, windowMs: number, now: number): number {
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    if (memory.size > 50_000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    }
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/** Returns true when the user may send now; counts the attempt either way. */
export async function allowChatSend(userId: string, now: number = Date.now()): Promise<boolean> {
  return allowWindows(`rl:chat`, userId, CHAT_LIMITS, now);
}

/**
 * Fixed-window limits under `${prefix}:${window name}:${subject}`. Redis first; an
 * in-memory window per instance when Redis is down (never "no limit" on an abuse surface).
 */
export async function allowWindows(
  prefix: string,
  subject: string,
  limits: ReadonlyArray<{ name: string; max: number; windowMs: number }>,
  now: number = Date.now(),
): Promise<boolean> {
  let allowed = true;
  for (const limit of limits) {
    const key = `${prefix}:${limit.name}:${subject}`;
    let count: number;
    try {
      await ensureRedis();
      count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, limit.windowMs);
    } catch {
      count = memoryHit(key, limit.windowMs, now);
    }
    if (count > limit.max) allowed = false;
  }
  return allowed;
}

/** Test helper. */
export function resetChatRateLimitMemory(): void {
  memory.clear();
}
