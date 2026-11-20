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
import { NotificationsModule } from './notifications/notifications.module';
import { StorageModule } from './storage/storage.module';
import { UploadsModule } from './uploads/uploads.module';
import { PlayersModule } from './players/players.module';
import { ProfilesModule } from './profiles/profiles.module';
import { RatingsModule } from './ratings/ratings.module';
import { ModerationModule } from './moderation/moderation.module';
import { WalletModule } from './wallet/wallet.module';
import { KycModule } from './kyc/kyc.module';
import { OpsModule } from './ops/ops.module';
import { DmModule } from './dm/dm.module';
import { BetaModule } from './beta/beta.module';
import { ReportsModule } from './reports/reports.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthController } from './health/health.controller';
import { env } from './config/env.instance';
import { appExceptionFilterFactory } from './shared/global-exception.filter';
import { requestIdFor } from './observability/request-id';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        ...(env.NODE_ENV === 'development'
          ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
          : {}),
        // Sprint 15 (F15.4): every log line and response carries a request id. A caller's
        // id is kept when it looks like one (proxies, the web app), else a new UUIDv7.
        genReqId: requestIdFor,
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.phone',
          'req.body.code',
          'req.body.refreshToken',
          'req.body.email',
          'req.body.turnstileToken',
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
    ModerationModule,
    NotificationsModule,
    WalletModule,
    KycModule,
    OpsModule,
    ObservabilityModule,
    DmModule,
    BetaModule,
    RealtimeModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useFactory: appExceptionFilterFactory }],
})
export class AppModule {}
