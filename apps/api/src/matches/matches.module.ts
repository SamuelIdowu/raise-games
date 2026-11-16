import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { MatchDeadlineWorker } from './match-deadline.worker';
import { MatchStateBroadcaster } from './match-state.broadcaster';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { ResultsService } from './results.service';

@Module({
  imports: [AuthModule, RealtimeCoreModule],
  controllers: [MatchesController],
  providers: [MatchesService, ResultsService, MatchStateBroadcaster, MatchDeadlineWorker],
  exports: [MatchesService, ResultsService],
})
export class MatchesModule {}
