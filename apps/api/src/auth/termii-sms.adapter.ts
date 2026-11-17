import type { SmsOtpPort } from './sms-otp.port';

interface TermiiConfig {
  apiKey: string;
  senderId: string;
}

export class TermiiSmsAdapter implements SmsOtpPort {
  constructor(private readonly config: TermiiConfig) {}

  async send(phone: string, code: string): Promise<void> {
    const res = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: phone,
        from: this.config.senderId,
        sms: `Your RAISE verification code is ${code}. It expires in 5 minutes.`,
        type: 'plain',
        // OTPs must use the DND (transactional) route. Termii: the generic route is for
        // promotional messages and is blocked for numbers on Nigeria's DND registry.
        channel: 'dnd',
        api_key: this.config.apiKey,
      }),
    });
    if (!res.ok) {
      throw new Error(`Termii SMS failed with status ${res.status}`);
    }
  }
}
