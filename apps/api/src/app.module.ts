import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { ChallengesModule } from './challenges/challenges.module';
import { ChatModule } from './chat/chat.module';
import { ConsentModule } from './consent/consent.module';
import { DisputesModule } from './disputes/disputes.controller';
import { GamesModule } from './games/games.module';
import { MatchesModule } from './matches/matches.module';
import { StorageModule } from './storage/storage.module';
import { UploadsModule } from './uploads/uploads.module';
import { PlayersModule } from './players/players.module';
import { ProfilesModule } from './profiles/profiles.module';
import { RatingsModule } from './ratings/ratings.module';
import { ReportsModule } from './reports/reports.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthController } from './health/health.controller';
import { env } from './config/env.instance';
import { appExceptionFilterFactory } from './shared/global-exception.filter';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp:
        env.NODE_ENV === 'development'
          ? {
              transport: { target: 'pino-pretty', options: { singleLine: true } },
              redact: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.phone',
                'req.body.code',
              ],
            }
          : {
              redact: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.phone',
                'req.body.code',
              ],
            },
    }),
    AuthModule,
    ConsentModule,
    GamesModule,
    ProfilesModule,
    ChallengesModule,
    PlayersModule,
    ReportsModule,
    StorageModule,
    UploadsModule,
    MatchesModule,
    ChatModule,
    DisputesModule,
    RatingsModule,
    RealtimeModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useFactory: appExceptionFilterFactory }],
})
export class AppModule {}
