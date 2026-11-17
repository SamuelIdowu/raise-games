import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { env } from '../config/env.instance';
import { db, schema } from '../db/client';

export type UserRole = 'player' | 'moderator' | 'admin';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
}

export interface AuthedUser {
  sub: string;
  sid: string;
  role: UserRole;
}

export interface AuthedRequest extends FastifyRequest {
  user?: AuthedUser;
}

/** Why a token or its backing session was rejected. Callers map this to their transport. */
export type AccessDenial = 'unauthenticated' | 'inactive' | 'suspended' | 'session_expired';

export class AccessDeniedError extends Error {
  constructor(readonly reason: AccessDenial) {
    super(reason);
  }
}

/**
 * Checks that a user's account and session are still usable: not deleted, not under an
 * active sanction, session not revoked or expired. Shared by the HTTP guard, the
 * WebSocket handshake, and the gateway's periodic re-check of long-lived sockets.
 */
export async function checkSessionActive(userId: string, sessionId: string): Promise<UserRole> {
  const [user] = await db
    .select({
      id: schema.users.id,
      role: schema.users.role,
      deletedAt: schema.users.deletedAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user || user.deletedAt) throw new AccessDeniedError('inactive');

  // Only bans block the account (Sprint 12 ladder). A suspended player keeps access so
  // they can see when it ends and finish current matches; play is blocked elsewhere
  // (moderation/standing.service).
  const now = new Date();
  const [sanction] = await db
    .select({ id: schema.sanctions.id })
    .from(schema.sanctions)
    .where(
      and(
        eq(schema.sanctions.userId, user.id),
        inArray(schema.sanctions.type, ['permanent_ban', 'temporary_ban']),
        isNull(schema.sanctions.revokedAt),
        lte(schema.sanctions.startsAt, now),
        or(isNull(schema.sanctions.endsAt), gt(schema.sanctions.endsAt, now)),
      ),
    )
    .limit(1);

  if (sanction) throw new AccessDeniedError('suspended');

  const [session] = await db
    .select({
      revokedAt: schema.sessions.revokedAt,
      expiresAt: schema.sessions.expiresAt,
    })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);

  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    throw new AccessDeniedError('session_expired');
  }

  return user.role;
}

/** Verifies an access JWT and its backing session. Throws AccessDeniedError. */
export async function verifyAccessToken(jwt: JwtService, token: string): Promise<AuthedUser> {
  let payload: AccessTokenPayload;
  try {
    payload = await jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: env.JWT_ACCESS_SECRET,
    });
  } catch {
    throw new AccessDeniedError('unauthenticated');
  }

  if (!payload.sub || !payload.sid) throw new AccessDeniedError('unauthenticated');

  const role = await checkSessionActive(payload.sub, payload.sid);
  return { sub: payload.sub, sid: payload.sid, role };
}

/**
 * Verifies the access JWT, then confirms the backing session is still active and the
 * account is not suspended. This makes logout/logout-all and sanctions effective
 * immediately instead of waiting for access-token expiry.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();

    try {
      request.user = await verifyAccessToken(this.jwt, header.slice('Bearer '.length));
    } catch (error) {
      if (!(error instanceof AccessDeniedError)) throw error;
      switch (error.reason) {
        case 'inactive':
          throw new UnauthorizedException('Account is not active');
        case 'suspended':
          throw new ForbiddenException('This account has been closed');
        case 'session_expired':
          throw new UnauthorizedException('Session expired');
        default:
          throw new UnauthorizedException();
      }
    }
    return true;
  }
}
