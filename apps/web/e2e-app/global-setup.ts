import { clearOtpIpLimit } from './otp-limit';

/** Start each run with a clean per-IP OTP budget (fixtures also clear before each signup). */
export default async function globalSetup() {
  await clearOtpIpLimit();
}
