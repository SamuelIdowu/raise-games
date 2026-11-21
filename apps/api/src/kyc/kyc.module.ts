import { Module } from '@nestjs/common';
import { KycService } from './kyc.service';
import { MockKycAdapter } from './mock-kyc.adapter';

/** KYC token for the active provider. Stage 2 binds its adapter here instead of the mock. */
export const KYC_PROVIDER = Symbol('KYC_PROVIDER');

/** Audit B31: identity tiers move through this port; no player-facing flow in Stage 1. */
@Module({
  providers: [KycService, MockKycAdapter, { provide: KYC_PROVIDER, useExisting: MockKycAdapter }],
  exports: [KycService, KYC_PROVIDER],
})
export class KycModule {}
