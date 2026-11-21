import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { RatingsModule } from '../ratings/ratings.module';
import { MatchDeadlineWorker } from './match-deadline.worker';
import { MatchStateBroadcaster } from './match-state.broadcaster';
import { BoardBroadcaster } from './board.broadcaster';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { ResultsService } from './results.service';

@Module({
  imports: [AuthModule, RealtimeCoreModule, RatingsModule],
  controllers: [MatchesController],
  providers: [
    MatchesService,
    ResultsService,
    MatchStateBroadcaster,
    BoardBroadcaster,
    MatchDeadlineWorker,
  ],
  exports: [MatchesService, ResultsService],
})
export class MatchesModule {}
