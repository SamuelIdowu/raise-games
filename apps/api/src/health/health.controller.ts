import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { pool } from '../db/client';
import { env } from '../config/env.instance';
import { pingRedis } from '../cache/redis';

@Controller()
export class HealthController {
  @Get()
  hello() {
    return { app: 'RAISE API', status: 'ok' };
  }

  /**
   * 200 when the database and Redis answer, 503 otherwise. Container healthchecks and load
   * balancers only read the status code, so a degraded instance must not answer 200 or it
   * keeps receiving traffic it cannot serve. The body is the same either way.
   */
  @Get('health')
  async health(@Res({ passthrough: true }) reply: FastifyReply) {
    const checks = { api: true, database: false, redis: false };
    try {
      await pool.query('select 1');
      checks.database = true;
    } catch {
      checks.database = false;
    }
    checks.redis = await pingRedis();
    const ok = checks.database && checks.redis;
    if (!ok) reply.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ok ? 'ok' : 'degraded',
      checks,
      env: env.NODE_ENV,
      otpMock: env.OTP_MOCK_ENABLED,
    };
  }
}
