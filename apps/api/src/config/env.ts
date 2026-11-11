import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().startsWith('postgres://'),
  REDIS_URL: z.string().startsWith('redis://').default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  OTP_MOCK_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  SMS_PROVIDER: z.enum(['mock', 'termii', 'twilio']).default('mock'),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration → ${issues}`);
  }
  const { OTP_MOCK_ENABLED: otpMock, NODE_ENV: env, ...rest } = parsed.data;
  if (otpMock && env !== 'development' && env !== 'test') {
    throw new Error('OTP_MOCK_ENABLED=true is only allowed in development/test — refusing to boot');
  }
  return { NODE_ENV: env, OTP_MOCK_ENABLED: otpMock, ...rest };
}
