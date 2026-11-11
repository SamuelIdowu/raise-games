/**
 * SmsOtpPort — the SMS/OTP boundary (Technical Architecture doc: ports & adapters at expected
 * change points). Sprint 3 replaces Sprint 0's request-OTP mechanics with vendor adapters.
 */
export interface SmsOtpPort {
  send(phone: string): Promise<void>;
  verify(phone: string, code: string): Promise<boolean>;
}

export function isMockOtpProvider(provider: string): boolean {
  return provider === 'mock';
}
