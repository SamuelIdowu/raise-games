import { Module } from '@nestjs/common';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { WalletModule } from '../wallet/wallet.module';
import { OpsJobs } from './ops.jobs';
import { OpsService } from './ops.service';

/** Sprint 15: operational alerts (stuck matches, delivery failures, outbox lag, ledger). */
@Module({
  imports: [RealtimeCoreModule, WalletModule],
  providers: [OpsService, OpsJobs],
  exports: [OpsService],
})
export class OpsModule {}
