import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { LoggerModule } from 'nestjs-pino';
import { HealthController } from './health/health.controller';
import { AuthController, JwtAuthGuard } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { env } from './config/env.instance';
import { appExceptionFilterFactory } from './shared/global-exception.filter';
import { parseTtl } from './auth/auth.utils';
import { GamesModule } from './games/games.module';
import { ProfilesModule } from './profiles/profiles.module';

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
    JwtModule.register({
      secret: env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: parseTtl(env.JWT_ACCESS_TTL) / 1000 },
    }),
    GamesModule,
    ProfilesModule,
  ],
  controllers: [HealthController, AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    { provide: APP_FILTER, useFactory: appExceptionFilterFactory },
  ],
})
export class AppModule {}
