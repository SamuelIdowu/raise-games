import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  /**
   * Number of proxies in front of the API (0 local, 1 host load balancer, 2 Cloudflare plus a
   * load balancer). Per-IP rate limits read the client IP through this many hops; see
   * shared/client-ip.ts.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
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
  /**
   * Sprint 13: HMAC secret for the mock wallet provider's webhooks. Unset = the mock
   * webhook route does not exist. Refused in production (like mock OTP).
   */
  MOCK_PROVIDER_WEBHOOK_SECRET: z.string().min(16).optional(),
  /**
   * Sprint 15: new WebSocket handshakes allowed per IP per minute. 60 suits players
   * (several devices behind one carrier NAT); load generators raise it on staging.
   */
  WS_CONNECT_LIMIT_PER_MIN: z.coerce.number().int().positive().default(60),
  /** Rollout stage for feature flags ('1' until Stage 2 launches). */
  APP_STAGE: z.enum(['1', '2', '3']).default('1'),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  /**
   * Staging gate (Sprint 3): comma-separated E.164 numbers. When set, real SMS is only
   * sent to these numbers; any other phone is refused. Leave empty in production.
   */
  SMS_ALLOWLIST: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
    ),
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  // ---- File storage (Cloudflare R2 in prod; any S3-compatible store locally) ----
  /** Optional override; defaults to https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com. */
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_FORCE_PATH_STYLE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  /** Dev/test only: create the private bucket on boot if missing. */
  STORAGE_AUTO_CREATE_BUCKET: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default('raise-proof-screenshots'),
  // ---- Notifications (Sprint 11). All optional: without them push is skipped and email
  // goes to the logging mock. Email vendor (Resend vs SES) is an open owner decision.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:support@raise.gg'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('RAISE <no-reply@raise.gg>'),
  /** Absolute web origin used in push/email deep links. */
  APP_URL: z.string().default('http://localhost:3000'),
  /**
   * Sprint 12: 32-byte base64 key that encrypts staff TOTP secrets at rest. Required
   * outside development/test (dev/test derive one from JWT_ACCESS_SECRET).
   */
  MFA_ENCRYPTION_KEY: z.string().optional(),
  /**
   * Audit B28: retention periods (owner and legal decision). Unset = keep forever; the
   * daily purge only runs for the ones that are set. See retention/retention.service.ts.
   */
  SCREENSHOT_RETENTION_DAYS: z.coerce.number().int().min(1).optional(),
  CHAT_RETENTION_DAYS: z.coerce.number().int().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration → ${issues}`);
  }
  const { OTP_MOCK_ENABLED: otpMock, NODE_ENV: env, ...rest } = parsed.data;
  if (env === 'production' && rest.MOCK_PROVIDER_WEBHOOK_SECRET) {
    throw new Error('MOCK_PROVIDER_WEBHOOK_SECRET is not allowed in production — refusing to boot');
  }
  if (otpMock && env !== 'development' && env !== 'test') {
    throw new Error('OTP_MOCK_ENABLED=true is only allowed in development/test — refusing to boot');
  }
  if (!rest.MFA_ENCRYPTION_KEY && env !== 'development' && env !== 'test') {
    throw new Error('MFA_ENCRYPTION_KEY is required outside development/test — refusing to boot');
  }
  if (env !== 'development' && env !== 'test') {
    const missing = missingDeploySettings(env, rest);
    if (missing.length) {
      throw new Error(`Missing settings for ${env} → ${missing.join('; ')} — refusing to boot`);
    }
  }
  return { NODE_ENV: env, OTP_MOCK_ENABLED: otpMock, ...rest };
}

/**
 * Audit B4: settings a deployed API cannot run safely without. Each of these silently
 * degrades when unset in development (Turnstile off, uploads unconfigured, SMS mocked),
 * which is fine locally and wrong anywhere players are.
 */
function missingDeploySettings(
  env: Env['NODE_ENV'],
  s: Omit<Env, 'NODE_ENV' | 'OTP_MOCK_ENABLED'>,
): string[] {
  const missing: string[] = [];
  if (s.SMS_PROVIDER === 'mock') missing.push('SMS_PROVIDER must be termii or twilio');
  if (s.SMS_PROVIDER !== 'mock' && !s.SMS_API_KEY) missing.push('SMS_API_KEY');
  if (!s.TURNSTILE_SECRET_KEY) missing.push('TURNSTILE_SECRET_KEY (signup bot check)');
  if (!(s.STORAGE_ENDPOINT || s.R2_ACCOUNT_ID) || !s.R2_ACCESS_KEY_ID || !s.R2_SECRET_ACCESS_KEY) {
    missing.push('R2_ACCOUNT_ID or STORAGE_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
  }
  if (env === 'production') {
    const local = (url: string) =>
      !url.startsWith('https://') || /localhost|127\.0\.0\.1/.test(url);
    if (s.WEB_ORIGIN.split(',').some(local))
      missing.push('WEB_ORIGIN must be https and not localhost');
    if (local(s.APP_URL)) missing.push('APP_URL must be https and not localhost');
  }
  return missing;
}
