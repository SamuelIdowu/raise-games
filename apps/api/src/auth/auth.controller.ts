import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AccountService } from './account.service';
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
  usernameQuerySchema,
  type OtpRequest,
  type OtpVerify,
  type RefreshRequest,
  type LogoutRequest,
  type UpdateMe,
  type UsernameQuery,
} from './auth.schemas';
import { verifyTurnstileToken } from './turnstile';
import { enforceRateLimit } from '../shared/rate-limit';
import { z } from 'zod';

const deleteAccountSchema = z.object({ confirmUsername: z.string().trim().min(1).max(64) });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly account: AccountService,
  ) {}

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
    if (turnstileRequired && body.turnstileToken) {
      const valid = await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY!, body.turnstileToken);
      if (!valid) throw new UnauthorizedException('Turnstile verification failed');
    }
    const ua = Array.isArray(req.headers['user-agent'])
      ? req.headers['user-agent'][0]
      : req.headers['user-agent'];
    return this.auth.requestOtp(body.phone, req.ip ?? 'unknown', ua, body.inviteCode);
  }

  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(
    @Body(new ZodValidationPipe(otpVerifySchema)) body: OtpVerify,
    @Req() req: FastifyRequest,
  ) {
    // Per-IP cap across phones (the per-phone cap is the attempt budget in the service).
    await enforceRateLimit(`otp:rate:ip:verify:${req.ip ?? 'unknown'}`, 30, 10 * 60_000);
    const ua = Array.isArray(req.headers['user-agent'])
      ? req.headers['user-agent'][0]
      : req.headers['user-agent'];
    const tokens = await this.auth.verifyOtp(
      body.phone,
      body.code,
      {
        userAgent: ua,
        ip: req.ip,
        deviceId: req.headers['x-device-id'] as string | undefined,
      },
      body.inviteCode,
    );
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

  /** Live check while a player types a username. Rate-limited so it can't list every name. */
  @Get('username-available')
  @UseGuards(JwtAuthGuard)
  async usernameAvailable(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(usernameQuerySchema)) query: UsernameQuery,
  ) {
    await enforceRateLimit(`rl:username-check:${user.sub}`, 60, 60_000);
    return this.auth.usernameAvailability(user.sub, query.username);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(updateMeSchema)) body: UpdateMe,
  ) {
    return this.auth.updateMe(user.sub, body);
  }

  /** Audit B28: everything held about the player, as JSON (right of access). */
  @Get('me/export')
  @UseGuards(JwtAuthGuard)
  async exportMe(@CurrentUser() user: AuthedUser) {
    await enforceRateLimit(`rl:account:export:${user.sub}`, 5, 86_400_000);
    return this.account.exportData(user.sub);
  }

  /** Audit B28: delete the account (right of erasure). The username must be typed to confirm. */
  @Post('me/delete')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async deleteMe(
    @CurrentUser() user: AuthedUser,
    @Req() req: FastifyRequest,
    @Body(new ZodValidationPipe(deleteAccountSchema)) body: z.infer<typeof deleteAccountSchema>,
  ) {
    await enforceRateLimit(`rl:account:delete:${user.sub}`, 5, 3_600_000);
    return this.account.deleteAccount(user.sub, body.confirmUsername, req.ip);
  }
}
