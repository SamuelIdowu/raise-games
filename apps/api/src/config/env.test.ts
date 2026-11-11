import { describe, it, expect } from 'vitest';
import { loadEnv } from './env';

describe('env schema', () => {
  it('rejects missing JWT_ACCESS_SECRET', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'development',
        PORT: '3001',
        WEB_ORIGIN: 'http://localhost:3000',
        DATABASE_URL: 'postgres://raise:raise@localhost:5432/raise',
        REDIS_URL: 'redis://localhost:6379',
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '30d',
        OTP_MOCK_ENABLED: 'true',
        SMS_PROVIDER: 'mock',
      }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('accepts valid dev config', () => {
    const env = loadEnv({
      NODE_ENV: 'development',
      PORT: '3001',
      WEB_ORIGIN: 'http://localhost:3000',
      DATABASE_URL: 'postgres://raise:raise@localhost:5432/raise',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'dev-only-secret-key-32-chars-minimum-length-for-jwt-signing',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '30d',
      OTP_MOCK_ENABLED: 'true',
      SMS_PROVIDER: 'mock',
    });
    expect(env.NODE_ENV).toBe('development');
    expect(env.OTP_MOCK_ENABLED).toBe(true);
  });

  it('rejects OTP_MOCK_ENABLED in production', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        PORT: '3001',
        WEB_ORIGIN: 'https://app.raise.ng',
        DATABASE_URL: 'postgres://raise:raise@localhost:5432/raise',
        REDIS_URL: 'redis://localhost:6379',
        JWT_ACCESS_SECRET: 'prod-secret-key-32-chars-minimum-length-for-jwt-signing',
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '30d',
        OTP_MOCK_ENABLED: 'true',
        SMS_PROVIDER: 'termii',
        SMS_API_KEY: 'key',
      }),
    ).toThrow('OTP_MOCK_ENABLED=true is only allowed in development/test');
  });
});
