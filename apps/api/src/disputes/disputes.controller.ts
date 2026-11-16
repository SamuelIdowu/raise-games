import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthModule } from '../auth/auth.module';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, type AuthedUser } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { enforceRateLimit } from '../shared/rate-limit';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import {
  APPEAL_REASON_MAX,
  DETAIL_MAX,
  DISPUTE_CATEGORIES,
  MAX_EVIDENCE_PER_PLAYER,
  RULING_OUTCOMES,
} from './disputes.rules';
import { DisputesService } from './disputes.service';

const idParam = z.object({ id: z.uuid() });
type IdParam = z.infer<typeof idParam>;

export const openDisputeSchema = z.object({
  category: z.enum(DISPUTE_CATEGORIES),
  detail: z
    .string()
    .trim()
    .min(10, 'Tell the moderator what happened (at least 10 characters)')
    .max(DETAIL_MAX),
  uploadIds: z.array(z.uuid()).max(MAX_EVIDENCE_PER_PLAYER).optional(),
});
export const addEvidenceSchema = z.object({
  uploadId: z.uuid().optional(),
  note: z.string().trim().max(500).optional(),
});
export const appealSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Explain why the ruling is wrong (at least 10 characters)')
    .max(APPEAL_REASON_MAX),
});
export const rulingSchema = z.object({
  outcome: z.enum(RULING_OUTCOMES),
  justification: z.string().trim().min(10).max(2000),
  sanctionNote: z.string().trim().max(500).optional(),
});
const reviewStatusSchema = z.object({ status: z.enum(['awaiting_info', 'reviewed']) });
const metricsQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

/** Player dispute surfaces (F9.1–F9.2). */
@Controller()
@UseGuards(JwtAuthGuard)
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  /** The match's dispute, or null. Both players see the same status (UX Flow 6). */
  @Get('matches/:id/dispute')
  async forMatch(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: IdParam,
  ) {
    await enforceRateLimit(`rl:disputes:view:${user.sub}`, 240, 60_000);
    return { dispute: await this.disputes.getForMatch(p.id, user) };
  }

  @Post('matches/:id/dispute')
  @HttpCode(200)
  open(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: IdParam,
    @Body(new ZodValidationPipe(openDisputeSchema)) body: z.infer<typeof openDisputeSchema>,
  ) {
    return this.disputes.open(user, p.id, body);
  }

  @Post('disputes/:id/evidence')
  @HttpCode(200)
  addEvidence(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: IdParam,
    @Body(new ZodValidationPipe(addEvidenceSchema)) body: z.infer<typeof addEvidenceSchema>,
  ) {
    return this.disputes.addEvidence(user, p.id, body);
  }

  @Post('disputes/:id/appeal')
  @HttpCode(200)
  async appeal(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: IdParam,
    @Body(new ZodValidationPipe(appealSchema)) body: z.infer<typeof appealSchema>,
  ) {
    await enforceRateLimit(`rl:disputes:appeal:${user.sub}`, 5, 3_600_000);
    return this.disputes.appeal(user, p.id, body.reason);
  }
}

/**
 * Moderator operations. Sprint 12 builds the queue UI on top; every action is audited.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('moderator', 'admin')
export class AdminDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post('disputes/:id/status')
  @HttpCode(204)
  async status(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: IdParam,
    @Body(new ZodValidationPipe(reviewStatusSchema)) body: z.infer<typeof reviewStatusSchema>,
  ) {
    await this.disputes.setReviewStatus(user, p.id, body.status);
  }

  @Post('disputes/:id/ruling')
  @HttpCode(200)
  ruling(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(idParam)) p: IdParam,
    @Body(new ZodValidationPipe(rulingSchema)) body: z.infer<typeof rulingSchema>,
  ) {
    return this.disputes.recordRuling(user, p.id, body);
  }

  @Get('disputes/:id/evidence')
  evidence(@CurrentUser() user: AuthedUser, @Param(new ZodValidationPipe(idParam)) p: IdParam) {
    return this.disputes.evidence(user, p.id);
  }

  @Get('metrics/disputes')
  metrics(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(metricsQuery)) q: z.infer<typeof metricsQuery>,
  ) {
    return this.disputes.metrics(user, q.days);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [DisputesController, AdminDisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
