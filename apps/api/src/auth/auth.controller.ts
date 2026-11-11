import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import type { FastifyRequest } from 'fastify';
import { env } from '../config/env.instance';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import {
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  type OtpRequest,
  type OtpVerify,
  type RefreshRequest,
} from './auth.schemas';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
}

async function verifyTurnstile(token: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true; // Skip in dev
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
  });
  const data = (await res.json()) as TurnstileResponse;
  return data.success === true;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync(header.slice('Bearer '.length), {
        secret: env.JWT_ACCESS_SECRET,
      });
      (request as AuthedRequest).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(
    @Body(new ZodValidationPipe(otpRequestSchema)) body: OtpRequest,
    @Req() req: FastifyRequest,
  ) {
    if (body.turnstileToken) {
      const valid = await verifyTurnstile(body.turnstileToken);
      if (!valid) throw new UnauthorizedException('Turnstile verification failed');
    }
    return this.auth.requestOtp(body.phone, req.ip ?? 'unknown');
  }

  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(
    @Body(new ZodValidationPipe(otpVerifySchema)) body: OtpVerify,
    @Req() req: FastifyRequest,
  ) {
    const tokens = await this.auth.verifyOtp(body.phone, body.code, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    if (!tokens) throw new UnauthorizedException('Invalid code');
    return tokens;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshRequest) {
    const tokens = await this.auth.refreshSession(body.refreshToken);
    if (!tokens) throw new UnauthorizedException('Invalid refresh token');
    return tokens;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: FastifyRequest) {
    const user = (req as AuthedRequest).user as { sub: string } | undefined;
    const current = await this.auth.findUserById(user?.sub ?? '');
    if (!current) throw new UnauthorizedException();
    return { id: current.id, phone: maskOut(current.phone), createdAt: current.createdAt };
  }
}

interface AuthedRequest extends FastifyRequest {
  user?: unknown;
}

function maskOut(phone: string): string {
  return phone.slice(0, 5) + '****' + phone.slice(-2);
}
