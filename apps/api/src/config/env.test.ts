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

  // Audit B4: a deployed API must not silently run with Turnstile off, mock SMS or no storage.
  const deployed = {
    PORT: '3001',
    DATABASE_URL: 'postgres://raise:raise@db:5432/raise',
    REDIS_URL: 'redis://redis:6379',
    JWT_ACCESS_SECRET: 'prod-secret-key-32-chars-minimum-length-for-jwt-signing',
    OTP_MOCK_ENABLED: 'false',
    MFA_ENCRYPTION_KEY: 'a'.repeat(44),
    SMS_PROVIDER: 'termii',
    SMS_API_KEY: 'key',
    TURNSTILE_SECRET_KEY: 'ts',
    R2_ACCOUNT_ID: 'acct',
    R2_ACCESS_KEY_ID: 'id',
    R2_SECRET_ACCESS_KEY: 'secret',
    WEB_ORIGIN: 'https://app.raise.ng',
    APP_URL: 'https://app.raise.ng',
  };

  it('accepts a complete production config', () => {
    expect(loadEnv({ ...deployed, NODE_ENV: 'production' }).NODE_ENV).toBe('production');
  });

  it('lists every missing deploy setting at once', () => {
    let message = '';
    try {
      loadEnv({
        ...deployed,
        NODE_ENV: 'staging',
        SMS_PROVIDER: 'mock',
        TURNSTILE_SECRET_KEY: undefined,
        R2_SECRET_ACCESS_KEY: undefined,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('SMS_PROVIDER must be termii or twilio');
    expect(message).toContain('TURNSTILE_SECRET_KEY');
    expect(message).toContain('R2_SECRET_ACCESS_KEY');
  });

  it('refuses localhost origins in production but not in staging', () => {
    const local = { ...deployed, WEB_ORIGIN: 'http://localhost:3000' };
    expect(() => loadEnv({ ...local, NODE_ENV: 'production' })).toThrow('WEB_ORIGIN');
    expect(loadEnv({ ...local, NODE_ENV: 'staging' }).NODE_ENV).toBe('staging');
  });
});
