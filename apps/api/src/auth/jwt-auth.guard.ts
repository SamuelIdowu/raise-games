import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
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
