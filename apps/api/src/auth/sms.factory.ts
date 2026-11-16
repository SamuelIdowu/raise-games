import { MockSmsAdapter } from './mock-sms.adapter';
import { TermiiSmsAdapter } from './termii-sms.adapter';
import { TwilioSmsAdapter } from './twilio-sms.adapter';
import type { SmsOtpPort } from './sms-otp.port';

export type SmsProvider = 'mock' | 'termii' | 'twilio';

export interface SmsFactoryConfig {
  provider: SmsProvider;
  apiKey?: string;
  senderId?: string;
  /** Staging gate: when non-empty, only these E.164 numbers receive real SMS. */
  allowlist?: string[];
}

export class SmsNotAllowlistedError extends Error {
  constructor() {
    super('This number is not on the staging SMS allow-list');
  }
}

/** Wraps a real adapter so staging can only text allow-listed test phones. */
export class AllowlistSmsAdapter implements SmsOtpPort {
  private readonly allowed: Set<string>;
  constructor(
    private readonly inner: SmsOtpPort,
    allowlist: string[],
  ) {
    this.allowed = new Set(allowlist);
  }
  async send(phone: string, code: string): Promise<void> {
    if (!this.allowed.has(phone)) throw new SmsNotAllowlistedError();
    await this.inner.send(phone, code);
  }
}

/**
 * Selects the SMS adapter. Decision (docs/decisions/0001-sms-vendor.md): Termii is the
 * primary vendor on its DND/transactional route, Twilio is the supported fallback, and
 * mock is dev/test only.
 */
export function createSmsAdapter(config: SmsFactoryConfig): SmsOtpPort {
  if (config.provider === 'mock') return new MockSmsAdapter();
  const real = createRealAdapter(config);
  return config.allowlist && config.allowlist.length > 0
    ? new AllowlistSmsAdapter(real, config.allowlist)
    : real;
}

function createRealAdapter(config: SmsFactoryConfig): SmsOtpPort {
  if (config.provider === 'termii') {
    if (!config.apiKey || !config.senderId) {
      throw new Error('SMS_PROVIDER=termii requires SMS_API_KEY and SMS_SENDER_ID');
    }
    return new TermiiSmsAdapter({ apiKey: config.apiKey, senderId: config.senderId });
  }

  if (!config.apiKey || !config.senderId) {
    throw new Error('SMS_PROVIDER=twilio requires SMS_API_KEY and SMS_SENDER_ID');
  }
  return new TwilioSmsAdapter({ credentials: config.apiKey, senderId: config.senderId });
}
