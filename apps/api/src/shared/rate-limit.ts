import { HttpException, HttpStatus } from '@nestjs/common';
import { ensureRedis, redis } from '../cache/redis';

export async function enforceRateLimit(key: string, max: number, windowMs: number): Promise<void> {
  try {
    await ensureRedis();
    const count = await redis.incr(key);
    if (count === 1) await redis.pexpire(key, windowMs);
    if (count > max) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
  } catch (error) {
    if (error instanceof HttpException) throw error;
  }
}
