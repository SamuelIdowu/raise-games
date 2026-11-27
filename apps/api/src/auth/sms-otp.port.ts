/**
 * SmsOtpPort — the SMS/OTP boundary (Technical Architecture doc: ports & adapters at expected
 * change points). Sprint 3 wires vendor adapters behind `SMS_PROVIDER`.
 */
/** Longest a vendor call may take before the OTP request fails with 503 (audit 2026-11-27). */
export const SMS_TIMEOUT_MS = 10_000;

export interface SmsOtpPort {
  send(phone: string, code: string): Promise<void>;
}

export function isMockOtpProvider(provider: string): boolean {
  return provider === 'mock';
}
