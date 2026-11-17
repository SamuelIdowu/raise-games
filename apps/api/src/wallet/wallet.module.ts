import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LedgerJobs } from '../ledger/ledger.jobs';
import { LedgerService } from '../ledger/ledger.service';
import { OutboxRelay } from '../realtime/outbox-relay';
import { RealtimeCoreModule } from '../realtime/realtime-core.module';
import { FlagsService } from './flags.service';
import { MockProviderAdapter } from './mock-provider.adapter';
import { ProviderRegistry } from './provider.registry';
import { LimitsController, WebhooksController } from './wallet.controller';
import { WALLET_EVENT_TYPES, WalletService } from './wallet.service';

/** Sprint 13: ledger, wallet provider port, stake limits, responsible-gaming settings. */
@Module({
  imports: [AuthModule, RealtimeCoreModule],
  controllers: [WebhooksController, LimitsController],
  providers: [
    LedgerService,
    LedgerJobs,
    FlagsService,
    MockProviderAdapter,
    ProviderRegistry,
    WalletService,
  ],
  exports: [LedgerService, FlagsService, ProviderRegistry, WalletService],
})
export class WalletModule implements OnModuleInit {
  constructor(
    private readonly relay: OutboxRelay,
    private readonly wallet: WalletService,
  ) {}

  /** Holds and settlement are an outbox consumer with their own delivery state. */
  onModuleInit(): void {
    this.relay.register({
      name: 'wallet',
      matches: (type) => (WALLET_EVENT_TYPES as readonly string[]).includes(type),
      handle: (event) => this.wallet.handle(event),
    });
  }
}
