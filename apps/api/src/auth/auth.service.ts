import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { hash, verify } from 'argon2';
import { v7 as uuidv7 } from 'uuid';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { env } from '../config/env.instance';
import { JwtService } from '@nestjs/jwt';
import { normalizeNigerianPhone } from '@raise/schemas';
import { ensureRedis, redis } from '../cache/redis';
import {
  buildRefreshToken,
  maskPhone,
  parseRefreshToken,
  parseTtl,
  randomCode,
} from './auth.utils';

interface PendingOtp {
  codeHash: string;
  attempts: number;
}

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_REQUESTS_PER_PHONE = 5;
const MAX_REQUESTS_PER_IP = 20;
const WINDOW_MS = 10 * 60 * 1000;

const pendingKey = (phone: string) => `otp:pending:${phone}`;
const resendKey = (phone: string) => `otp:resend:${phone}`;
const phoneRateKey = (phone: string) => `otp:rate:phone:${phone}`;
const ipRateKey = (ip: string) => `otp:rate:ip:${ip}`;

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async requestOtp(rawPhone: string, ip: string): Promise<{ resendAfterSeconds: number }> {
    const phone = this.normalize(rawPhone);

    await this.withRedis(async () => {
      await this.bumpRate(phoneRateKey(phone), MAX_REQUESTS_PER_PHONE);
      await this.bumpRate(ipRateKey(ip), MAX_REQUESTS_PER_IP);
      await this.assertResendAllowed(phone);
    });

    // Sprint 3 swaps in the real SmsOtpPort adapter; the code is generated + hashed identically
    const code = env.OTP_MOCK_ENABLED ? '000000' : randomCode();
    const codeHash = await hash(code);
    const entry: PendingOtp = { codeHash, attempts: 0 };

    await this.withRedis(async () => {
      await redis.set(pendingKey(phone), JSON.stringify(entry), 'PX', OTP_TTL_MS);
      await redis.set(resendKey(phone), '1', 'PX', OTP_RESEND_COOLDOWN_MS);
    });

    return { resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000 };
  }

  async verifyOtp(
    rawPhone: string,
    code: string,
    meta: { deviceId?: string; userAgent?: string; ip?: string },
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    const phone = this.normalize(rawPhone);
    const key = pendingKey(phone);

    const outcome = await this.withRedis(async () => {
      const raw = await redis.get(key);
      if (!raw) return { status: 'missing' as const };

      const entry = JSON.parse(raw) as PendingOtp;
      if (entry.attempts >= OTP_MAX_ATTEMPTS) {
        await redis.del(key);
        return { status: 'locked' as const };
      }

      const ok = env.OTP_MOCK_ENABLED ? code === '000000' : await verify(entry.codeHash, code);
      if (!ok) {
        entry.attempts += 1;
        const ttl = await redis.pttl(key);
        if (ttl > 0) await redis.set(key, JSON.stringify(entry), 'PX', ttl);
        else await redis.del(key);
        return { status: 'invalid' as const };
      }

      await redis.del(key);
      return { status: 'ok' as const };
    });

    if (outcome.status !== 'ok') return null;

    const user = await this.findOrCreateUser(phone);
    if (!user) return null;
    return this.createSession(user.id, meta);
  }

  async refreshSession(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) return null;

    const found = await db
      .select()
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.id, parsed.sessionId),
          isNull(schema.sessions.revokedAt),
          gt(schema.sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    const session = found[0];
    if (!session) return null;

    const ok = await verify(session.refreshTokenHash, refreshToken);
    if (!ok) return null;

    await db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.id, session.id));

    return this.createSession(session.userId, {});
  }

  private async findOrCreateUser(phone: string) {
    const found = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.phone, phone))
      .limit(1);
    const existing = found[0];
    if (existing && !existing.deletedAt) return existing;
    if (existing?.deletedAt) return null; // banned/removed accounts cannot log in

    const id = uuidv7();
    await db.insert(schema.users).values({ id, phone });
    await db.insert(schema.auditLog).values({
      id: uuidv7(),
      action: 'identity.user_created',
      objectType: 'user',
      objectId: id,
      after: { phone: maskPhone(phone) },
    });
    const created = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return created[0] ?? null;
  }

  async findUserById(id: string) {
    if (!id) return null;
    const found = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return found[0] ?? null;
  }

  async createSession(
    userId: string,
    meta: { deviceId?: string; userAgent?: string; ip?: string },
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const sessionId = uuidv7();
    const refreshToken = buildRefreshToken(sessionId);
    const refreshTokenHash = await hash(refreshToken);
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId,
      refreshTokenHash,
      deviceId: meta.deviceId,
      userAgent: meta.userAgent,
      ip: meta.ip,
      expiresAt: new Date(Date.now() + parseTtl(env.JWT_REFRESH_TTL)),
    });
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: env.JWT_ACCESS_SECRET, expiresIn: parseTtl(env.JWT_ACCESS_TTL) / 1000 },
    );
    return { accessToken, refreshToken };
  }

  private normalize(rawPhone: string): string {
    const phone = normalizeNigerianPhone(rawPhone);
    if (!phone) throw new BadRequestException('Invalid phone number');
    return phone;
  }

  private async withRedis<T>(fn: () => Promise<T>): Promise<T> {
    try {
      await ensureRedis();
      return await fn();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('OTP service unavailable');
    }
  }

  private async bumpRate(key: string, max: number): Promise<void> {
    const count = await redis.incr(key);
    if (count === 1) await redis.pexpire(key, WINDOW_MS);
    if (count > max) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async assertResendAllowed(phone: string): Promise<void> {
    const key = resendKey(phone);
    if ((await redis.exists(key)) === 0) return;
    const ttl = await redis.pttl(key);
    const seconds = ttl > 0 ? Math.ceil(ttl / 1000) : Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000);
    throw new HttpException(
      `Wait ${seconds}s before requesting another code`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
