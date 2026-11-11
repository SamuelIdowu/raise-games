import { Controller, Get } from '@nestjs/common';
import { pool } from '../db/client';
import { env } from '../config/env.instance';
import { pingRedis } from '../cache/redis';

@Controller()
export class HealthController {
  @Get()
  hello() {
    return { app: 'RAISE API', status: 'ok' };
  }

  @Get('health')
  async health() {
    const checks = { api: true, database: false, redis: false };
    try {
      await pool.query('select 1');
      checks.database = true;
    } catch {
      checks.database = false;
    }
    checks.redis = await pingRedis();
    return {
      status: checks.database && checks.redis ? 'ok' : 'degraded',
      checks,
      env: env.NODE_ENV,
      otpMock: env.OTP_MOCK_ENABLED,
    };
  }
}
