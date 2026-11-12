/**
 * SmsOtpPort — the SMS/OTP boundary (Technical Architecture doc: ports & adapters at expected
 * change points). Sprint 3 wires vendor adapters behind `SMS_PROVIDER`.
 */
export interface SmsOtpPort {
  send(phone: string, code: string): Promise<void>;
}

export function isMockOtpProvider(provider: string): boolean {
  return provider === 'mock';
}
