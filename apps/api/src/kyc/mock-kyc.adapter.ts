import { Injectable } from '@nestjs/common';
import type { KycProviderPort, KycSession } from './kyc-provider.port';

/**
 * Mock KYC provider (audit B31). Returns a deterministic session and never contacts anyone.
 * Stage 1 has no player-facing KYC flow, so nothing calls `start` outside tests; the
 * Stage 2 provider adapter replaces it behind the same port.
 */
@Injectable()
export class MockKycAdapter implements KycProviderPort {
  readonly name = 'mock';

  async start(input: { key: string; userId: string }): Promise<KycSession> {
    return { reference: `mock-kyc-${input.key}`, url: null };
  }
}
