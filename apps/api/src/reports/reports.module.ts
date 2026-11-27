import {
  BadRequestException,
  Body,
  Controller,
  Injectable,
  Module,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { AuthModule } from '../auth/auth.module';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, type AuthedUser } from '../auth/jwt-auth.guard';
import { db, schema } from '../db/client';
import { enforceRateLimit } from '../shared/rate-limit';
import { ZodValidationPipe } from '../shared/zod-validation.pipe';

export const createReportSchema = z.object({
  subjectType: z.enum(['challenge', 'user']),
  subjectId: z.uuid(),
  reason: z.enum([
    'harassment',
    'hate',
    'cheating',
    'off_platform',
    'spam',
    'impersonation',
    'other',
  ]),
  note: z.string().trim().max(500).optional(),
});
export type CreateReportRequest = z.infer<typeof createReportSchema>;

/**
 * Generic reports (Sprint 6 F6.4: report capability on challenge detail). Writes the row
 * and an outbox event; triage and enforcement are Sprint 12. Idempotent per reporter and
 * subject: reporting twice returns the existing report.
 */
@Injectable()
export class ReportsService {
  async create(
    reporter: AuthedUser,
    input: CreateReportRequest,
  ): Promise<{ reportId: string; alreadyReported: boolean }> {
    const exists =
      input.subjectType === 'challenge'
        ? await db
            .select({ owner: schema.challenges.posterId })
            .from(schema.challenges)
            .where(eq(schema.challenges.id, input.subjectId))
            .limit(1)
        : await db
            .select({ owner: schema.users.id })
            .from(schema.users)
            .where(eq(schema.users.id, input.subjectId))
            .limit(1);
    if (!exists[0]) throw new NotFoundException('Not found');
    if (exists[0].owner === reporter.sub)
      throw new BadRequestException('You cannot report yourself');

    const reportId = uuidv7();
    const inserted = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(schema.reports)
        .values({
          id: reportId,
          reporterId: reporter.sub,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          reason: input.reason,
          note: input.note ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: schema.reports.id });
      if (rows.length > 0) {
        await tx.insert(schema.outboxEvents).values({
          id: uuidv7(),
          type: 'report.created',
          subjectId: reportId,
          payload: { reportId, ...input, reporterId: reporter.sub },
        });
      }
      return rows;
    });
    if (inserted.length > 0) return { reportId, alreadyReported: false };

    const [existing] = await db
      .select({ id: schema.reports.id })
      .from(schema.reports)
      .where(
        and(
          eq(schema.reports.reporterId, reporter.sub),
          eq(schema.reports.subjectType, input.subjectType),
          eq(schema.reports.subjectId, input.subjectId),
        ),
      )
      .limit(1);
    return { reportId: existing?.id ?? reportId, alreadyReported: true };
  }
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: AuthedUser,
    @Body(new ZodValidationPipe(createReportSchema)) input: CreateReportRequest,
  ) {
    await enforceRateLimit(`rl:reports:${user.sub}`, 20, 3_600_000);
    return this.reports.create(user, input);
  }
}

@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
