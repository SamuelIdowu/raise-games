import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { ensureRedis, redis } from '../cache/redis';
import { env } from '../config/env.instance';
import { db, schema } from '../db/client';
import type { AuthedRequest, AuthedUser } from '../auth/jwt-auth.guard';
import { open, seal, secretBoxKey } from '../shared/secret-box';
import { generateTotpSecret, otpauthUri, verifyTotp } from '../shared/totp';

/**
 * Staff MFA (Sprint 12, F12.1; TA §Security "MFA for admins"). TOTP, verified per refresh
 * family so access-token rotation does not demand a new code every 15 minutes.
 *   - staff routes: a code within the last 12 hours
 *   - sensitive routes (@StepUp): a code within the last 15 minutes
 */
export const MFA_SESSION_MS = 12 * 3600_000;
export const MFA_STEP_UP_MS = 15 * 60_000;

export const MFA_MESSAGES = {
  setupRequired: 'Set up two-factor authentication to use moderator tools.',
  required: 'Enter your authenticator code to continue.',
  stepUp: 'Enter a fresh authenticator code for this action.',
  badCode: 'That code did not work. Check the time on your phone and try again.',
  alreadyEnabled: 'Two-factor authentication is already set up.',
  notSetUp: 'Start two-factor setup first.',
} as const;

const key = () => secretBoxKey(env);
const isStaff = (u?: AuthedUser) => u?.role === 'moderator' || u?.role === 'admin';

/** Last MFA time on the caller's refresh family. */
export async function lastMfaAt(sessionId: string): Promise<Date | null> {
  const { rows } = await db.execute<{ at: string | null }>(sql`
    SELECT max(s.mfa_verified_at) AS at FROM sessions s
    WHERE s.id = ${sessionId}
       OR (s.family_id IS NOT NULL AND s.family_id =
             (SELECT x.family_id FROM sessions x WHERE x.id = ${sessionId}))`);
  return rows[0]?.at ? new Date(rows[0].at) : null;
}

@Injectable()
export class MfaService {
  async status(user: AuthedUser) {
    if (!isStaff(user)) throw new ForbiddenException('Moderators only');
    const [u] = await db
      .select({ enabledAt: schema.users.mfaEnabledAt })
      .from(schema.users)
      .where(eq(schema.users.id, user.sub));
    const last = await lastMfaAt(user.sid);
    return {
      enabled: Boolean(u?.enabledAt),
      verifiedAt: last?.toISOString() ?? null,
      sessionValid: !!last && Date.now() - last.getTime() < MFA_SESSION_MS,
    };
  }

  /** New pending secret (replaces an unfinished one). Refused once MFA is enabled. */
  async setup(user: AuthedUser) {
    if (!isStaff(user)) throw new ForbiddenException();
    const [u] = await db
      .select({ enabledAt: schema.users.mfaEnabledAt, name: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.id, user.sub));
    if (u?.enabledAt) throw new ForbiddenException(MFA_MESSAGES.alreadyEnabled);
    const secret = generateTotpSecret();
    await db
      .update(schema.users)
      .set({ mfaSecretEnc: seal(key(), secret), updatedAt: new Date() })
      .where(eq(schema.users.id, user.sub));
    return { secret, otpauthUri: otpauthUri(secret, u?.name ?? user.sub.slice(0, 8)) };
  }

  /** First code: turns MFA on and verifies this session. */
  async enable(user: AuthedUser, code: string, ip?: string) {
    await this.check(user, code, { allowPending: true });
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({ mfaEnabledAt: now, updatedAt: now })
        .where(eq(schema.users.id, user.sub));
      await tx
        .update(schema.sessions)
        .set({ mfaVerifiedAt: now })
        .where(eq(schema.sessions.id, user.sid));
      await tx.insert(schema.auditLog).values({
        id: uuidv7(),
        actorId: user.sub,
        action: 'admin.mfa_enabled',
        objectType: 'user',
        objectId: user.sub,
        ip: ip ?? null,
      });
    });
    return this.status(user);
  }

  /** Step-up: a fresh code marks this session verified now. */
  async verify(user: AuthedUser, code: string, ip?: string) {
    await this.check(user, code, { allowPending: false });
    await db
      .update(schema.sessions)
      .set({ mfaVerifiedAt: new Date() })
      .where(eq(schema.sessions.id, user.sid));
    await db.insert(schema.auditLog).values({
      id: uuidv7(),
      actorId: user.sub,
      action: 'admin.mfa_verified',
      objectType: 'session',
      objectId: user.sid,
      ip: ip ?? null,
    });
    return this.status(user);
  }

  private async check(user: AuthedUser, code: string, opts: { allowPending: boolean }) {
    if (!isStaff(user)) throw new ForbiddenException();
    await this.rateLimit(user.sub);
    const [u] = await db
      .select({ enc: schema.users.mfaSecretEnc, enabledAt: schema.users.mfaEnabledAt })
      .from(schema.users)
      .where(eq(schema.users.id, user.sub));
    if (!u?.enc) throw new ForbiddenException(MFA_MESSAGES.notSetUp);
    if (!opts.allowPending && !u.enabledAt)
      throw new ForbiddenException(MFA_MESSAGES.setupRequired);
    if (opts.allowPending && u.enabledAt) throw new ForbiddenException(MFA_MESSAGES.alreadyEnabled);
    const secret = open(key(), u.enc);
    const last = await this.lastStep(user.sub);
    const result = verifyTotp(secret, code, Date.now(), last);
    if (!result.ok) throw new UnauthorizedException(MFA_MESSAGES.badCode);
    await this.rememberStep(user.sub, result.step);
  }

  /** 5 attempts per 5 minutes per account. Fails closed: MFA is not a best-effort check. */
  private async rateLimit(userId: string) {
    await ensureRedis();
    const k = `rl:mfa:${userId}`;
    const n = await redis.incr(k);
    if (n === 1) await redis.pexpire(k, 5 * 60_000);
    if (n > 5)
      throw new HttpException(
        'Too many attempts. Wait a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }

  /** Replay guard: a code's step can be used once. */
  private async lastStep(userId: string): Promise<number | null> {
    const v = await redis.get(`mfa:step:${userId}`);
    return v === null ? null : Number(v);
  }

  private async rememberStep(userId: string, step: number) {
    await redis.set(`mfa:step:${userId}`, String(step), 'PX', 120_000);
  }
}

// ---------------------------------------------------------------- guard

const STEP_UP = 'mfa:step_up';
/** Marks a route as sensitive: needs a code from the last 15 minutes. */
export const StepUp = () => SetMetadata(STEP_UP, true);

/**
 * Staff + MFA gate for every moderator/admin route (after JwtAuthGuard). Errors carry a
 * `code` the admin UI uses to show setup or the code prompt.
 */
@Injectable()
export class StaffMfaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    if (!isStaff(user)) throw new ForbiddenException('Moderators only');

    const [u] = await db
      .select({ enabledAt: schema.users.mfaEnabledAt })
      .from(schema.users)
      .where(eq(schema.users.id, user.sub));
    if (!u?.enabledAt) {
      throw new ForbiddenException({
        code: 'mfa_setup_required',
        message: MFA_MESSAGES.setupRequired,
      });
    }
    const last = await lastMfaAt(user.sid);
    const stepUp = this.reflector.getAllAndOverride<boolean>(STEP_UP, [
      context.getHandler(),
      context.getClass(),
    ]);
    const maxAge = stepUp ? MFA_STEP_UP_MS : MFA_SESSION_MS;
    if (!last || Date.now() - last.getTime() > maxAge) {
      throw new ForbiddenException({
        code: stepUp ? 'mfa_step_up' : 'mfa_required',
        message: stepUp ? MFA_MESSAGES.stepUp : MFA_MESSAGES.required,
      });
    }
    return true;
  }
}
