import { Injectable } from '@nestjs/common';
import type { SmsOtpPort } from './sms-otp.port';

/**
 * MockSmsAdapter — dev/test only. Never in staging/production (env.instance throws on boot).
 * Dev ergonomics: the fixed code is generated in AuthService, so this adapter is a no-op.
 */
@Injectable()
export class MockSmsAdapter implements SmsOtpPort {
  async send(_phone: string, _code: string): Promise<void> {
    // no side effects; the fixed dev code is '000000'
  }
}
