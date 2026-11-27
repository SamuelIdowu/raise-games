import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const pingRedis = vi.fn();
vi.mock('../db/client', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../cache/redis', () => ({ pingRedis: () => pingRedis() }));
vi.mock('../config/env.instance', () => ({
  env: { NODE_ENV: 'test', OTP_MOCK_ENABLED: false },
}));

const { HealthController } = await import('./health.controller');

function fakeReply() {
  const reply = { statusCode: 200, status: vi.fn((c: number) => ((reply.statusCode = c), reply)) };
  return reply;
}

describe('GET /health', () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue({ rows: [] });
    pingRedis.mockReset().mockResolvedValue(true);
  });

  it('answers 200 when the database and Redis are up', async () => {
    const reply = fakeReply();
    const body = await new HealthController().health(reply as never);
    expect(reply.statusCode).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('answers 503 when the database is down', async () => {
    query.mockRejectedValue(new Error('connection refused'));
    const reply = fakeReply();
    const body = await new HealthController().health(reply as never);
    expect(reply.statusCode).toBe(503);
    expect(body).toMatchObject({ status: 'degraded', checks: { database: false, redis: true } });
  });

  it('answers 503 when Redis is down', async () => {
    pingRedis.mockResolvedValue(false);
    const reply = fakeReply();
    const body = await new HealthController().health(reply as never);
    expect(reply.statusCode).toBe(503);
    expect(body.checks.redis).toBe(false);
  });
});
