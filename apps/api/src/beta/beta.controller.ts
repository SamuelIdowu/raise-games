import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { JwtAuthGuard, type AuthedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { StaffMfaGuard, StepUp } from '../moderation/mfa';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { enforceRateLimit } from '../shared/rate-limit';
import { BetaService } from './beta.service';

const waitlistBody = z.object({
  phone: z.string().trim().min(10).max(20),
  place: z.string().trim().max(80).optional(),
});
const feedbackBody = z.object({
  kind: z.enum(['bug', 'idea', 'other']),
  body: z.string().trim().min(3).max(2000),
  page: z.string().max(300).optional(),
  appVersion: z.string().max(64).optional(),
});
const idParam = z.object({ id: z.uuid() });
const createCodesBody = z.object({
  cohort: z.string().trim().min(2).max(60),
  place: z.string().trim().max(80).nullable().optional(),
  maxUses: z.number().int().min(1).max(1000).default(50),
  expiresAt: z.iso.datetime().nullable().optional(),
  count: z.number().int().min(1).max(50).default(1),
});
const updateCodeBody = z
  .object({
    active: z.boolean().optional(),
    maxUses: z.number().int().min(1).max(1000).optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
const inviteBody = z.object({ codeId: z.uuid() });
const severity = z.enum(['S1', 'S2', 'S3', 'S4']);
const status = z.enum(['new', 'triaged', 'fixed', 'wont_fix', 'duplicate']);
const feedbackQuery = z.object({
  status: z.union([status, z.literal('open')]).optional(),
  severity: severity.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
const triageBody = z
  .object({
    severity: severity.optional(),
    status: status.optional(),
    note: z.string().max(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
const metricsQuery = z.object({
  cohort: z.string().trim().max(60).optional(),
  since: z.iso.datetime().optional(),
});

/** Public beta endpoints: gate status (for the signup screen) and the waitlist. */
@Controller('beta')
export class BetaPublicController {
  constructor(private readonly beta: BetaService) {}

  @Get('status')
  status() {
    return this.beta.status();
  }

  @Post('waitlist')
  async waitlist(
    @Body(new ZodValidationPipe(waitlistBody)) b: z.infer<typeof waitlistBody>,
    @Req() req: FastifyRequest,
  ) {
    await enforceRateLimit(`beta:waitlist:ip:${req.ip ?? 'unknown'}`, 5, 3_600_000);
    return this.beta.joinWaitlist(b.phone, b.place);
  }
}

/** Player feedback (F16.3). */
@Controller('feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(private readonly beta: BetaService) {}

  @Post()
  async submit(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(feedbackBody)) b: z.infer<typeof feedbackBody>,
    @Req() req: FastifyRequest,
  ) {
    await enforceRateLimit(`feedback:${user.sub}`, 10, 3_600_000);
    const ua = req.headers['user-agent'];
    return this.beta.submitFeedback(user, b, Array.isArray(ua) ? ua[0] : ua);
  }
}

/** Staff: invite codes, waitlist, metrics, feedback triage. Behind staff MFA (Sprint 12). */
@Controller('admin')
@UseGuards(JwtAuthGuard, StaffMfaGuard)
export class BetaAdminController {
  constructor(private readonly beta: BetaService) {}

  @Get('beta/codes')
  codes() {
    return this.beta.codes();
  }

  @Post('beta/codes')
  @StepUp()
  createCodes(
    @CurrentUser() me: AuthedUser,
    @Body(new ZodValidationPipe(createCodesBody)) b: z.infer<typeof createCodesBody>,
  ) {
    return this.beta.createCodes(me, b);
  }

  @Patch('beta/codes/:id')
  @StepUp()
  updateCode(
    @CurrentUser() me: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: z.infer<typeof idParam>,
    @Body(new ZodValidationPipe(updateCodeBody)) b: z.infer<typeof updateCodeBody>,
  ) {
    return this.beta.updateCode(me, p.id, b);
  }

  @Get('beta/waitlist')
  waitlist() {
    return this.beta.waitlist();
  }

  @Post('beta/waitlist/:id/invite')
  @StepUp()
  invite(
    @CurrentUser() me: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: z.infer<typeof idParam>,
    @Body(new ZodValidationPipe(inviteBody)) b: z.infer<typeof inviteBody>,
  ) {
    return this.beta.inviteFromWaitlist(me, p.id, b.codeId);
  }

  @Get('metrics')
  metrics(@Query(new ZodValidationPipe(metricsQuery)) q: z.infer<typeof metricsQuery>) {
    return this.beta.metrics(q);
  }

  @Get('feedback')
  feedback(@Query(new ZodValidationPipe(feedbackQuery)) q: z.infer<typeof feedbackQuery>) {
    return this.beta.feedbackQueue(q);
  }

  @Patch('feedback/:id')
  triage(
    @CurrentUser() me: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: z.infer<typeof idParam>,
    @Body(new ZodValidationPipe(triageBody)) b: z.infer<typeof triageBody>,
  ) {
    return this.beta.triage(me, p.id, b);
  }
}
