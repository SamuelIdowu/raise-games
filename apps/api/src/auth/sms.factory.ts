import { MockSmsAdapter } from './mock-sms.adapter';
import { TermiiSmsAdapter } from './termii-sms.adapter';
import { TwilioSmsAdapter } from './twilio-sms.adapter';
import type { SmsOtpPort } from './sms-otp.port';

export type SmsProvider = 'mock' | 'termii' | 'twilio';

export interface SmsFactoryConfig {
  provider: SmsProvider;
  apiKey?: string;
  senderId?: string;
}

/**
 * Selects the SMS adapter. Vendor choice is an owner decision; Termii is the assumed
 * Nigeria-first default, Twilio is supported, and mock is dev/test only.
 */
export function createSmsAdapter(config: SmsFactoryConfig): SmsOtpPort {
  if (config.provider === 'mock') return new MockSmsAdapter();

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
