import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ensureRedis, redis } from '../cache/redis';

const logger = new Logger('RateLimit');

/**
 * Fixed-window counters kept in this process. Used only while Redis is unreachable, so
 * limits stay bounded per instance instead of failing open (audit 2026-11-17 finding #8,
 * Sprint 15 F15.6). Across N instances the effective limit is at most N × max during an
 * outage, which is far better than unlimited for OTP verify and webhooks.
 */
const memory = new Map<string, { count: number; resetAt: number }>();
const MEMORY_MAX_KEYS = 50_000;
let degradedSince: number | null = null;

export function memoryHit(key: string, windowMs: number, now = Date.now()): number {
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    if (memory.size >= MEMORY_MAX_KEYS) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
      // Still full of live windows: drop the oldest insertion to bound memory.
      if (memory.size >= MEMORY_MAX_KEYS) memory.delete(memory.keys().next().value!);
    }
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

export function resetRateLimitMemory(): void {
  memory.clear();
  degradedSince = null;
}

export async function enforceRateLimit(key: string, max: number, windowMs: number): Promise<void> {
  let count: number;
  try {
    await ensureRedis();
    count = await redis.incr(key);
    if (count === 1) await redis.pexpire(key, windowMs);
    if (degradedSince !== null) {
      logger.log(`Redis back after ${Date.now() - degradedSince}ms; rate limits shared again`);
      degradedSince = null;
    }
  } catch {
    if (degradedSince === null) {
      degradedSince = Date.now();
      logger.warn('Redis unavailable: rate limits fall back to this process');
    }
    count = memoryHit(key, windowMs);
  }
  if (count > max) {
    throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
  }
}
