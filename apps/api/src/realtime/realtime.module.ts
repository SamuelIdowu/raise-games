import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';
import { MatchesModule } from '../matches/matches.module';
import { RealtimeCoreModule } from './realtime-core.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [AuthModule, RealtimeCoreModule, MatchesModule, ChatModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
