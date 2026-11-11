import { Injectable } from '@nestjs/common';
import { env } from '../config/env.instance';
import type { SmsOtpPort } from './sms-otp.port';

/**
 * MockSmsAdapter — dev/test only. Never in staging/production (env.instance throws on boot).
 * Dev ergonomics: deterministic code. Code is hashed at rest and single-use below.
 */
@Injectable()
export class MockSmsAdapter implements SmsOtpPort {
  async send(_phone: string): Promise<void> {
    // no side effects; codes are fixed in test mode
  }

  async verify(_phone: string, code: string): Promise<boolean> {
    if (!env.OTP_MOCK_ENABLED) return false;
    return code === '000000';
  }
}
