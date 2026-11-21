import { Injectable } from '@nestjs/common';
import { FlagsService } from './flags.service';
import { MockProviderAdapter } from './mock-provider.adapter';
import type { WalletProviderPort } from './wallet-provider.port';

/**
 * Picks the wallet provider for a player (TA "adapter swap plus a flag"). A live provider
 * is used only when BOTH the `live_wallet_provider` flag is on for the current stage and
 * the player's jurisdiction AND a live adapter is registered. Stage 1 registers none, so
 * this always resolves to the mock; a test asserts it.
 */
@Injectable()
export class ProviderRegistry {
  private readonly live = new Map<string, WalletProviderPort>();

  constructor(
    private readonly mock: MockProviderAdapter,
    private readonly flags: FlagsService,
  ) {}

  /** Stage 2 wiring point. Nothing calls this in Stage 1. */
  registerLive(provider: WalletProviderPort): void {
    this.live.set(provider.name, provider);
  }

  async resolve(jurisdiction: string | null): Promise<WalletProviderPort> {
    if (this.live.size === 0) return this.mock;
    if (!(await this.flags.isEnabled('live_wallet_provider', { jurisdiction }))) return this.mock;
    return [...this.live.values()][0]!;
  }

  /** Provider by name, for settling holds placed earlier (a hold settles where it was made). */
  byName(name: string): WalletProviderPort {
    if (name === this.mock.name) return this.mock;
    const p = this.live.get(name);
    if (!p) throw new Error(`Wallet provider ${name} is not registered`);
    return p;
  }

  get mockProvider(): MockProviderAdapter {
    return this.mock;
  }
}
