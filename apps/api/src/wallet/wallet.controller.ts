import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, type AuthedUser } from '../auth/jwt-auth.guard';
import { db, schema } from '../db/client';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { enforceRateLimit } from '../shared/rate-limit';
import { FlagsService } from './flags.service';
import { type LimitState, applyChange, settlePending } from './limits';
import { SIGNATURE_HEADER } from './webhook-signature';
import { WalletService } from './wallet.service';

const limit = z.number().int().min(0).max(1_000_000_000_00).nullable();
const limitsBody = z
  .object({
    limits: z
      .object({ daily: limit.optional(), weekly: limit.optional(), monthly: limit.optional() })
      .optional(),
    selfExcludeDays: z.number().int().min(1).max(3650).optional(),
  })
  .refine((b) => b.limits !== undefined || b.selfExcludeDays !== undefined, 'Nothing to change');

/**
 * Provider webhooks (F13.2). Unauthenticated by design: the signature is the
 * authentication. 404 for any provider without a configured secret.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly wallet: WalletService) {}

  @Post('providers/:provider')
  @HttpCode(200)
  async receive(
    @Param('provider') provider: string,
    @Req() req: FastifyRequest & { rawBody?: Buffer },
  ) {
    if (!/^[a-z0-9_-]{1,40}$/.test(provider)) throw new NotFoundException();
    await enforceRateLimit(`rl:webhooks:${provider}:${req.ip ?? 'unknown'}`, 600, 60_000);
    if (!req.rawBody) throw new BadRequestException('Raw body required');
    const sig = req.headers[SIGNATURE_HEADER];
    return this.wallet.receiveWebhook(
      provider,
      req.rawBody.toString('utf8'),
      Array.isArray(sig) ? sig[0] : sig,
    );
  }
}

/**
 * Responsible-gaming limits and self-exclusion (F13.5). The fields exist from Stage 1;
 * the endpoints answer 404 until `responsible_gaming_settings` is on for the player's
 * state (Stage 2 builds the screens).
 */
@Controller('me/limits')
@UseGuards(JwtAuthGuard)
export class LimitsController {
  constructor(private readonly flags: FlagsService) {}

  @Get()
  async get(@CurrentUser() user: AuthedUser) {
    await this.gate(user.sub);
    return toView(await this.load(user.sub, new Date()));
  }

  @Put()
  async update(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(limitsBody)) body: z.infer<typeof limitsBody>,
  ) {
    await this.gate(user.sub);
    await enforceRateLimit(`rl:limits:${user.sub}`, 20, 3_600_000);
    const now = new Date();
    const next = applyChange(await this.load(user.sub, now), body, now);
    const row = {
      dailyStakeLimitMinor: next.limits.daily,
      weeklyStakeLimitMinor: next.limits.weekly,
      monthlyStakeLimitMinor: next.limits.monthly,
      pendingLimits: next.pending,
      pendingEffectiveAt: next.pendingEffectiveAt,
      selfExcludedUntil: next.selfExcludedUntil,
      updatedAt: now,
    };
    await db
      .insert(schema.limitSettings)
      .values({ userId: user.sub, ...row })
      .onConflictDoUpdate({ target: schema.limitSettings.userId, set: row });
    return toView(next);
  }

  private async gate(userId: string) {
    const [u] = await db
      .select({ state: schema.users.jurisdictionState })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!(await this.flags.isEnabled('responsible_gaming_settings', { jurisdiction: u?.state }))) {
      throw new NotFoundException();
    }
  }

  private async load(userId: string, now: Date): Promise<LimitState> {
    const [r] = await db
      .select()
      .from(schema.limitSettings)
      .where(eq(schema.limitSettings.userId, userId));
    return settlePending(
      {
        limits: {
          daily: r?.dailyStakeLimitMinor ?? null,
          weekly: r?.weeklyStakeLimitMinor ?? null,
          monthly: r?.monthlyStakeLimitMinor ?? null,
        },
        pending: (r?.pendingLimits as LimitState['pending']) ?? null,
        pendingEffectiveAt: r?.pendingEffectiveAt ?? null,
        selfExcludedUntil: r?.selfExcludedUntil ?? null,
      },
      now,
    );
  }
}

function toView(s: LimitState) {
  return {
    limits: s.limits,
    pending: s.pending,
    pendingEffectiveAt: s.pendingEffectiveAt?.toISOString() ?? null,
    selfExcludedUntil: s.selfExcludedUntil?.toISOString() ?? null,
  };
}
