import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { DmController } from './dm.controller';
import { DmEnabledGuard } from './dm.flag';
import { DmService } from './dm.service';

/** Sprint 14: restricted DMs, friend requests. Behind the `messaging.dm` flag. */
@Module({
  imports: [AuthModule, RealtimeCoreModule],
  controllers: [DmController],
  providers: [DmService, DmEnabledGuard],
})
export class DmModule {}
