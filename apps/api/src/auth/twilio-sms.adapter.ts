import type { SmsOtpPort } from './sms-otp.port';

interface TwilioConfig {
  /** `SMS_API_KEY` must be `ACCOUNT_SID:AUTH_TOKEN` until a dedicated config lands. */
  credentials: string;
  senderId: string;
}

export class TwilioSmsAdapter implements SmsOtpPort {
  constructor(private readonly config: TwilioConfig) {}

  async send(phone: string, code: string): Promise<void> {
    const [accountSid, authToken] = this.config.credentials.split(':');
    if (!accountSid || !authToken) {
      throw new Error('Twilio SMS requires SMS_API_KEY="ACCOUNT_SID:AUTH_TOKEN"');
    }
    const body = new URLSearchParams({
      To: phone,
      From: this.config.senderId,
      Body: `Your RAISE verification code is ${code}. It expires in 5 minutes.`,
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );
    if (!res.ok) {
      throw new Error(`Twilio SMS failed with status ${res.status}`);
    }
  }
}
