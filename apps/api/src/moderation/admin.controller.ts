import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard, type AuthedRequest, type AuthedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';
import { enforceRateLimit } from '../shared/rate-limit';
import { AdminService } from './admin.service';
import { MfaService, StaffMfaGuard, StepUp } from './mfa';
import { SanctionsService } from './sanctions.service';
import { RULING_OUTCOMES } from '../disputes/disputes.rules';

const id = z.object({ id: z.uuid() });
type Id = z.infer<typeof id>;
const code = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') });
const pageQ = z.object({
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const queueQ = pageQ.extend({
  state: z.enum(['unassigned', 'assigned', 'awaiting_info', 'resolved']).optional(),
  mine: z.enum(['true', 'false']).optional(),
});
const decideBody = z.object({
  outcome: z.enum(RULING_OUTCOMES),
  justification: z.string().trim().min(10).max(2000),
  sanction: z
    .object({ userId: z.uuid(), reason: z.string().trim().min(5).max(500) })
    .nullable()
    .optional(),
});
const noteBody = z.object({ body: z.string().trim().min(1).max(2000) });
const assignBody = z.object({ force: z.boolean().optional() });
const usersQ = pageQ.extend({ q: z.string().trim().max(64).optional() });
const sanctionBody = z.object({
  reason: z.string().trim().min(5).max(500),
  step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
});
const revokeBody = z.object({ note: z.string().trim().min(3).max(500) });
const roleBody = z.object({ role: z.enum(['player', 'moderator', 'admin']) });
const revealBody = z.object({ why: z.string().trim().min(5).max(300) });
const bulkSanctionBody = z.object({
  userIds: z.array(z.uuid()).min(1).max(100),
  reason: z.string().trim().min(5).max(500),
  batchId: z.uuid(),
});
const clearBody = z.object({
  userIds: z.array(z.uuid()).min(1).max(100),
  note: z.string().trim().min(3).max(500),
});
const reportsQ = z.object({
  status: z.enum(['open', 'dismissed', 'actioned']).default('open'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const resolveBody = z.object({
  items: z
    .array(z.object({ kind: z.enum(['report', 'message', 'flag']), id: z.uuid() }))
    .min(1)
    .max(100),
  resolution: z.enum(['dismissed', 'actioned']),
  note: z.string().trim().min(3).max(500),
  sanctionUserId: z.uuid().nullable().optional(),
});
const flagBody = z.object({ enabled: z.boolean() });
const formatBody = z.object({
  status: z.enum(['enabled', 'disabled']).optional(),
  name: z.string().trim().min(1).max(64).optional(),
  tiebreakRules: z.string().trim().min(1).max(500).optional(),
});
const auditQ = pageQ.extend({
  action: z.string().trim().max(64).optional(),
  actorId: z.uuid().optional(),
  objectId: z.string().trim().max(64).optional(),
});

/** MFA enrolment and step-up: staff only, deliberately outside StaffMfaGuard. */
@Controller('admin/mfa')
@UseGuards(JwtAuthGuard)
export class AdminMfaController {
  constructor(private readonly mfa: MfaService) {}

  @Get()
  status(@CurrentUser() user: AuthedUser) {
    return this.mfa.status(user);
  }

  @Post('setup')
  @HttpCode(200)
  setup(@CurrentUser() user: AuthedUser) {
    return this.mfa.setup(user);
  }

  @Post('enable')
  @HttpCode(200)
  enable(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(code)) b: z.infer<typeof code>,
    @Req() req: AuthedRequest,
  ) {
    return this.mfa.enable(user, b.code, req.ip);
  }

  @Post('verify')
  @HttpCode(200)
  verify(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(code)) b: z.infer<typeof code>,
    @Req() req: AuthedRequest,
  ) {
    return this.mfa.verify(user, b.code, req.ip);
  }
}

/**
 * Trust & operations console (Sprint 12). Every route: staff role + MFA within 12h;
 * @StepUp routes need a code within 15 minutes. Every write is audited in the service.
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, StaffMfaGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly sanctions: SanctionsService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  // ---- disputes
  @Get('queue/disputes')
  queue(
    @CurrentUser() user: AuthedUser,
    @Query(new ZodValidationPipe(queueQ)) q: z.infer<typeof queueQ>,
  ) {
    return this.admin.queue(
      { state: q.state, mine: q.mine === 'true', cursor: q.cursor, limit: q.limit },
      user,
    );
  }

  @Post('disputes/:id/assign')
  @HttpCode(200)
  assign(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(id)) p: Id,
    @Body(new ZodValidationPipe(assignBody)) b: z.infer<typeof assignBody>,
  ) {
    return this.admin.assign(user, p.id, b.force ?? false);
  }

  @Post('disputes/:id/unassign')
  @HttpCode(200)
  unassign(@CurrentUser() user: AuthedUser, @Param(new ZodValidationPipe(id)) p: Id) {
    return this.admin.unassign(user, p.id);
  }

  @Get('disputes/:id/viewer')
  viewer(@CurrentUser() user: AuthedUser, @Param(new ZodValidationPipe(id)) p: Id) {
    return this.admin.viewer(user, p.id);
  }

  @Post('disputes/:id/notes')
  note(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(id)) p: Id,
    @Body(new ZodValidationPipe(noteBody)) b: z.infer<typeof noteBody>,
  ) {
    return this.admin.addNote(user, p.id, b.body);
  }

  @Post('disputes/:id/decide')
  @HttpCode(200)
  @StepUp()
  async decide(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(id)) p: Id,
    @Body(new ZodValidationPipe(decideBody)) b: z.infer<typeof decideBody>,
  ) {
    await enforceRateLimit(`rl:admin:decide:${user.sub}`, 30, 60_000);
    return this.admin.decide(user, p.id, b);
  }

  // ---- users
  @Get('users')
  users(@Query(new ZodValidationPipe(usersQ)) q: z.infer<typeof usersQ>) {
    return this.admin.searchUsers(q);
  }

  @Get('users/:id')
  user(@Param(new ZodValidationPipe(id)) p: Id) {
    return this.admin.userDetail(p.id);
  }

  @Post('users/:id/reveal-phone')
  @HttpCode(200)
  @StepUp()
  reveal(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(id)) p: Id,
    @Body(new ZodValidationPipe(revealBody)) b: z.infer<typeof revealBody>,
  ) {
    return this.admin.revealPhone(user, p.id, b.why);
  }

  @Post('users/:id/sanctions')
  @StepUp()
  sanction(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(id)) p: Id,
    @Body(new ZodValidationPipe(sanctionBody)) b: z.infer<typeof sanctionBody>,
  ) {
    return this.sanctions.apply(user, {
      userId: p.id,
      reason: b.reason,
      source: 'manual',
      step: b.step,
    });
  }

  @Post('sanctions/:id/revoke')
  @HttpCode(200)
  @StepUp()
  revoke(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(id)) p: Id,
    @Body(new ZodValidationPipe(revokeBody)) b: z.infer<typeof revokeBody>,
  ) {
    return this.sanctions.revoke(user, p.id, b.note);
  }

  @Patch('users/:id/role')
  @StepUp()
  role(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(id)) p: Id,
    @Body(new ZodValidationPipe(roleBody)) b: z.infer<typeof roleBody>,
  ) {
    return this.admin.setRole(user, p.id, b.role);
  }

  @Post('bulk/sanctions')
  @HttpCode(200)
  @StepUp()
  bulkSanctions(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(bulkSanctionBody)) b: z.infer<typeof bulkSanctionBody>,
  ) {
    return this.sanctions.bulkApply(user, b.userIds, b.reason, b.batchId);
  }

  @Post('bulk/clear-fraud')
  @HttpCode(200)
  clearFraud(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(clearBody)) b: z.infer<typeof clearBody>,
  ) {
    return this.admin.clearFraud(user, b.userIds, b.note);
  }

  // ---- reports & signals
  @Get('queue/reports')
  reports(@Query(new ZodValidationPipe(reportsQ)) q: z.infer<typeof reportsQ>) {
    return this.admin.reportsQueue(q);
  }

  @Post('reports/resolve')
  @HttpCode(200)
  resolve(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(resolveBody)) b: z.infer<typeof resolveBody>,
  ) {
    return this.admin.resolveReports(user, b.items, b);
  }

  @Get('signals')
  signals() {
    return this.admin.signals();
  }

  // ---- flags, games, audit
  @Get('flags')
  flags() {
    return this.admin.flags();
  }

  @Patch('flags/:id')
  @StepUp()
  setFlag(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(id)) p: Id,
    @Body(new ZodValidationPipe(flagBody)) b: z.infer<typeof flagBody>,
  ) {
    return this.admin.setFlag(user, p.id, b.enabled);
  }

  @Get('games')
  games() {
    return this.admin.gamesConfig();
  }

  @Patch('formats/:id')
  @StepUp()
  format(
    @CurrentUser() user: AuthedUser,
    @Param(new ZodValidationPipe(id)) p: Id,
    @Body(new ZodValidationPipe(formatBody)) b: z.infer<typeof formatBody>,
  ) {
    return this.admin.updateFormat(user, p.id, b);
  }

  @Get('audit')
  audit(@Query(new ZodValidationPipe(auditQ)) q: z.infer<typeof auditQ>) {
    return this.admin.auditLog(q);
  }
}
