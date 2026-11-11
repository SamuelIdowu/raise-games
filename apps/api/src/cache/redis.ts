import Redis from 'ioredis';
import { env } from '../config/env.instance';

/**
 * Shared Redis connection. Lazy so the API still boots when Redis is unavailable;
 * endpoints that need it surface a 503 rather than hanging.
 */
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 2000,
});

export async function ensureRedis(): Promise<void> {
  if (redis.status === 'wait' || redis.status === 'end') {
    await redis.connect();
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    await ensureRedis();
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}
