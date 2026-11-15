import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { MatchStateBroadcaster } from './match-state.broadcaster';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({
  imports: [AuthModule, RealtimeCoreModule],
  controllers: [MatchesController],
  providers: [MatchesService, MatchStateBroadcaster],
  exports: [MatchesService],
})
export class MatchesModule {}
