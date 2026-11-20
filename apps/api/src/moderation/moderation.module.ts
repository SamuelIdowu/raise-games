import { Module, OnModuleInit } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { AuthModule } from '../auth/auth.module';
import { db, schema } from '../db/client';
import { DisputesModule } from '../disputes/disputes.controller';
import { RatingsModule } from '../ratings/ratings.module';
import { OutboxRelay } from '../realtime/outbox-relay';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { AdminController, AdminMfaController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminMatchesService } from './admin-matches.service';
import { MfaService, StaffMfaGuard } from './mfa';
import { SanctionsService } from './sanctions.service';

/**
 * Trust & operations (Sprint 12): admin console API, staff MFA, sanction ladder, and the
 * reputation-debt consumer that turns late cancels and no-show forfeits into records.
 */
@Module({
  imports: [AuthModule, DisputesModule, RatingsModule, RealtimeCoreModule],
  controllers: [AdminMfaController, AdminController],
  providers: [AdminService, AdminMatchesService, MfaService, SanctionsService, StaffMfaGuard],
  exports: [SanctionsService, StaffMfaGuard, MfaService],
})
export class ModerationModule implements OnModuleInit {
  constructor(private readonly relay: OutboxRelay) {}

  onModuleInit(): void {
    this.relay.register({
      name: 'reputation-debts',
      matches: (type) => type === 'reputation.debt',
      handle: async (event) => {
        const p = event.payload as { userId?: string; reason?: string; matchId?: string | null };
        if (!p.userId) return;
        await db
          .insert(schema.reputationDebts)
          .values({
            id: uuidv7(),
            userId: p.userId,
            reason: p.reason ?? 'unknown',
            matchId: p.matchId ?? null,
            sourceEventId: event.id,
          })
          .onConflictDoNothing({ target: schema.reputationDebts.sourceEventId });
      },
    });
  }
}
