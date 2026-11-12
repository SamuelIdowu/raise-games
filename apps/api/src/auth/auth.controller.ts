import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { FastifyRequest } from 'fastify';
import { env } from '../config/env.instance';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { JwtAuthGuard, type AuthedUser } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import {
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  logoutSchema,
  updateMeSchema,
  type OtpRequest,
  type OtpVerify,
  type RefreshRequest,
  type LogoutRequest,
  type UpdateMe,
} from './auth.schemas';
import { verifyTurnstileToken } from './turnstile';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(
    @Body(new ZodValidationPipe(otpRequestSchema)) body: OtpRequest,
    @Req() req: FastifyRequest,
  ) {
    const turnstileRequired = !!env.TURNSTILE_SECRET_KEY;
    const pending = turnstileRequired && (await this.auth.hasPendingOtp(body.phone));
    if (turnstileRequired && !pending && !body.turnstileToken) {
      throw new BadRequestException('Complete the security check');
    }
    if (body.turnstileToken) {
      const valid = await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY!, body.turnstileToken);
      if (!valid) throw new UnauthorizedException('Turnstile verification failed');
    }
    const ua = Array.isArray(req.headers['user-agent'])
      ? req.headers['user-agent'][0]
      : req.headers['user-agent'];
    return this.auth.requestOtp(body.phone, req.ip ?? 'unknown', ua);
  }

  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(
    @Body(new ZodValidationPipe(otpVerifySchema)) body: OtpVerify,
    @Req() req: FastifyRequest,
  ) {
    const ua = Array.isArray(req.headers['user-agent'])
      ? req.headers['user-agent'][0]
      : req.headers['user-agent'];
    const tokens = await this.auth.verifyOtp(body.phone, body.code, {
      userAgent: ua,
      ip: req.ip,
      deviceId: req.headers['x-device-id'] as string | undefined,
    });
    if (!tokens) throw new UnauthorizedException('Invalid or expired code');
    return tokens;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshRequest) {
    const tokens = await this.auth.refreshSession(body.refreshToken);
    if (!tokens) throw new UnauthorizedException('Invalid or reused refresh token');
    return tokens;
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body(new ZodValidationPipe(logoutSchema)) body: LogoutRequest) {
    // Stateless: the refresh token itself proves ownership; no access token required.
    await this.auth.logoutByRefreshToken(body.refreshToken);
    return { ok: true };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logoutAll(@CurrentUser() user: AuthedUser) {
    const count = await this.auth.logoutAll(user.sub);
    return { ok: true, revoked: count };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthedUser) {
    return this.auth.me(user.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(updateMeSchema)) body: UpdateMe,
  ) {
    return this.auth.updateMe(user.sub, body);
  }
}
