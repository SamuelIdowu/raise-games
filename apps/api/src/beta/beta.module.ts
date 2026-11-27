import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BetaAdminController, BetaPublicController, FeedbackController } from './beta.controller';
import { BetaService } from './beta.service';

/** Sprint 16: closed beta (invites, waitlist, metrics, feedback triage). */
@Module({
  imports: [AuthModule],
  controllers: [BetaPublicController, FeedbackController, BetaAdminController],
  providers: [BetaService],
})
export class BetaModule {}
