import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull, lte, gt, or } from 'drizzle-orm';
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

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(header.slice('Bearer '.length), {
        secret: env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException();
    }

    if (!payload.sub || !payload.sid) throw new UnauthorizedException();

    const [user] = await db
      .select({
        id: schema.users.id,
        role: schema.users.role,
        deletedAt: schema.users.deletedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .limit(1);

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Account is not active');
    }

    // Check for active sanction
    const now = new Date();
    const [sanction] = await db
      .select({ id: schema.sanctions.id })
      .from(schema.sanctions)
      .where(
        and(
          eq(schema.sanctions.userId, user.id),
          isNull(schema.sanctions.revokedAt),
          lte(schema.sanctions.startsAt, now),
          or(isNull(schema.sanctions.endsAt), gt(schema.sanctions.endsAt, now)),
        ),
      )
      .limit(1);

    if (sanction) {
      throw new ForbiddenException('Account is suspended');
    }

    const [session] = await db
      .select({
        revokedAt: schema.sessions.revokedAt,
        expiresAt: schema.sessions.expiresAt,
      })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, payload.sid))
      .limit(1);

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expired');
    }

    request.user = { sub: user.id, sid: payload.sid, role: user.role };
    return true;
  }
}
