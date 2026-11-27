import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OutboxRelay } from '../realtime/outbox-relay';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { LeaderboardsController } from './leaderboards.controller';
import { LeaderboardsService } from './leaderboards.service';
import { RATING_EVENT_TYPES, RatingsService } from './ratings.service';
import { ReputationService } from './reputation.service';

@Module({
  imports: [AuthModule, RealtimeCoreModule],
  controllers: [LeaderboardsController],
  providers: [RatingsService, LeaderboardsService, ReputationService],
  exports: [RatingsService, ReputationService],
})
export class RatingsModule implements OnModuleInit {
  constructor(
    private readonly relay: OutboxRelay,
    private readonly ratings: RatingsService,
  ) {}

  /** Ratings are an outbox consumer with their own delivery state (F10.2). */
  onModuleInit(): void {
    this.relay.register({
      name: 'ratings',
      matches: (type) => (RATING_EVENT_TYPES as readonly string[]).includes(type),
      handle: (event) => this.ratings.handle(event),
    });
  }
}
