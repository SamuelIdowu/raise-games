import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { hash, verify } from 'argon2';
import { v7 as uuidv7 } from 'uuid';
import { eq, and, isNull } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { env } from '../config/env.instance';
import { JwtService } from '@nestjs/jwt';
import { normalizeNigerianPhone } from '@raise/schemas';
import { ensureRedis, redis } from '../cache/redis';
import {
  buildRefreshToken,
  isSessionExpired,
  maskPhone,
  parseRefreshToken,
  parseTtl,
  randomCode,
  resolveFamilyId,
} from './auth.utils';
import { SmsService } from './sms.service';
import type { UpdateMe } from './auth.schemas';

interface PendingOtp {
  codeHash: string;
  attempts: number;
}

interface SessionMeta {
  deviceId?: string;
  userAgent?: string;
  ip?: string;
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
  constructor(
    private readonly jwt: JwtService,
    private readonly sms: SmsService,
  ) {}

  async requestOtp(
    rawPhone: string,
    ip: string,
    userAgent?: string,
  ): Promise<{ resendAfterSeconds: number }> {
    const phone = this.normalize(rawPhone);

    await this.withRedis(async () => {
      await this.assertResendAllowed(phone);
      await this.bumpRate(phoneRateKey(phone), MAX_REQUESTS_PER_PHONE);
      await this.bumpRate(ipRateKey(ip), MAX_REQUESTS_PER_IP);
    });

    const code = env.OTP_MOCK_ENABLED ? '000000' : randomCode();
    const codeHash = await hash(code);
    const entry: PendingOtp = { codeHash, attempts: 0 };

    await this.withRedis(async () => {
      await redis.set(pendingKey(phone), JSON.stringify(entry), 'PX', OTP_TTL_MS);
      await redis.set(resendKey(phone), '1', 'PX', OTP_RESEND_COOLDOWN_MS);
    });

    try {
      await this.sms.sendOtp(phone, code);
    } catch {
      throw new ServiceUnavailableException('Could not send verification code');
    }

    await this.audit('identity.otp_requested', {
      objectId: maskPhone(phone),
      ip,
      meta: { provider: env.SMS_PROVIDER, userAgent: userAgent ?? null },
    });

    return { resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000 };
  }

  async hasPendingOtp(rawPhone: string): Promise<boolean> {
    const phone = this.normalize(rawPhone);
    return this.withRedis(async () => (await redis.exists(pendingKey(phone))) > 0);
  }

  async verifyOtp(
    rawPhone: string,
    code: string,
    meta: SessionMeta,
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

    if (outcome.status !== 'ok') {
      await this.audit('identity.otp_failed', {
        objectId: maskPhone(phone),
        ip: meta.ip,
        meta: {
          reason: outcome.status,
          deviceId: meta.deviceId ?? null,
          userAgent: meta.userAgent ?? null,
        },
      });
      return null;
    }

    const user = await this.findOrCreateUser(phone, meta);
    if (!user) return null;

    await this.audit('identity.login', {
      actorId: user.id,
      objectId: user.id,
      ip: meta.ip,
    });

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
      .where(eq(schema.sessions.id, parsed.sessionId))
      .limit(1);

    const session = found[0];
    if (!session) return null;

    const tokenMatches = await verify(session.refreshTokenHash, refreshToken);
    if (!tokenMatches) return null;

    const familyId = resolveFamilyId(session);

    // A rotated (revoked) token being presented is a reuse signal: revoke the whole chain.
    if (session.revokedAt) {
      await this.revokeFamily(familyId);
      await this.audit('identity.refresh_reuse_detected', {
        actorId: session.userId,
        objectId: session.id,
        meta: { familyId },
      });
      return null;
    }

    if (isSessionExpired(session.expiresAt)) return null;

    const rotated = await db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.sessions.id, session.id), isNull(schema.sessions.revokedAt)))
      .returning({ id: schema.sessions.id });

    // Concurrent refresh: another request already rotated this token → treat as reuse.
    if (rotated.length === 0) {
      await this.revokeFamily(familyId);
      return null;
    }

    return this.createSession(session.userId, {}, familyId);
  }

  async logoutByRefreshToken(refreshToken: string): Promise<boolean> {
    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) return false;

    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, parsed.sessionId))
      .limit(1);

    if (!session) return false;
    if (!(await verify(session.refreshTokenHash, refreshToken))) return false;
    if (session.revokedAt) return true; // already logged out — idempotent

    await this.revokeSession(session.id);
    await this.audit('identity.logout', { actorId: session.userId, objectId: session.id });
    return true;
  }

  async logoutAll(userId: string): Promise<number> {
    const revoked = await db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)))
      .returning({ id: schema.sessions.id });

    await this.audit('identity.logout_all', {
      actorId: userId,
      objectId: userId,
      meta: { revoked: revoked.length },
    });
    return revoked.length;
  }

  async updateMe(userId: string, data: UpdateMe) {
    await db
      .update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
    return this.me(userId);
  }

  async me(userId: string) {
    const user = await this.findUserById(userId);
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      phone: maskPhone(user.phone),
      displayName: user.displayName,
      role: user.role,
      jurisdictionState: user.jurisdictionState,
      identityTier: user.identityTier,
      createdAt: user.createdAt,
    };
  }

  async findUserById(id: string) {
    if (!id) return null;
    const found = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return found[0] ?? null;
  }

  async createSession(
    userId: string,
    meta: SessionMeta,
    familyId?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const sessionId = uuidv7();
    const refreshToken = buildRefreshToken(sessionId);
    const refreshTokenHash = await hash(refreshToken);
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId,
      familyId: familyId ?? sessionId,
      refreshTokenHash,
      deviceId: meta.deviceId,
      userAgent: meta.userAgent,
      ip: meta.ip,
      expiresAt: new Date(Date.now() + parseTtl(env.JWT_REFRESH_TTL)),
    });
    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: sessionId },
      { secret: env.JWT_ACCESS_SECRET, expiresIn: parseTtl(env.JWT_ACCESS_TTL) / 1000 },
    );
    return { accessToken, refreshToken };
  }

  private async revokeSession(sessionId: string): Promise<void> {
    await db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.sessions.id, sessionId), isNull(schema.sessions.revokedAt)));
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.sessions.familyId, familyId), isNull(schema.sessions.revokedAt)));
  }

  private async findOrCreateUser(phone: string, meta: SessionMeta) {
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
    await this.audit('identity.user_created', {
      actorId: id,
      objectId: id,
      ip: meta.ip,
      meta: { userAgent: meta.userAgent ?? null, deviceId: meta.deviceId ?? null },
    });
    const created = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return created[0] ?? null;
  }

  private async audit(
    action: string,
    data: { actorId?: string; objectId?: string; ip?: string; meta?: Record<string, unknown> },
  ): Promise<void> {
    try {
      await db.insert(schema.auditLog).values({
        id: uuidv7(),
        actorId: data.actorId,
        action,
        objectType: action.split('.')[0],
        objectId: data.objectId,
        after: data.meta,
        ip: data.ip,
      });
    } catch {
      // Audit must never break an auth flow.
    }
  }

  private normalize(rawPhone: string): string {
    const phone = normalizeNigerianPhone(rawPhone);
    if (!phone) throw new ForbiddenException('Invalid phone number');
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
