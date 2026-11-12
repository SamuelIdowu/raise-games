import { Injectable } from '@nestjs/common';
import { env } from '../config/env.instance';
import { createSmsAdapter } from './sms.factory';
import type { SmsOtpPort } from './sms-otp.port';

@Injectable()
export class SmsService {
  private readonly adapter: SmsOtpPort;

  constructor() {
    this.adapter = createSmsAdapter({
      provider: env.SMS_PROVIDER,
      apiKey: env.SMS_API_KEY,
      senderId: env.SMS_SENDER_ID,
    });
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    await this.adapter.send(phone, code);
  }
}
