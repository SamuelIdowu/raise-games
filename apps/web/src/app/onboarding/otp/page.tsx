'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, OtpInput, Banner } from '@/components/ui';
import { authApi, setTokens } from '@raise/api-client';

export default function OtpPage() {
  const [otp, setOtp] = useState('');
  const [resendSeconds, setResendSeconds] = useState(30);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [phone, setPhone] = useState('0801 234 5678');
  const router = useRouter();

  useEffect(() => {
    const stored = sessionStorage.getItem('onboarding_phone');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setPhone(stored);
  }, []);

  useEffect(() => {
    if (resendSeconds > 0) {
      const timer = setInterval(() => setResendSeconds((s) => s - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [resendSeconds]);

  const handleVerify = async () => {
    setError('');
    if (otp.length !== 6) {
      setError('Enter the full 6-digit code');
      return;
    }
    setVerifying(true);
    try {
      const phone = sessionStorage.getItem('onboarding_phone');
      if (!phone) {
        throw new Error('Session expired. Please start over.');
      }
      const data = await authApi.verifyOtp(phone, otp);
      setTokens(data.accessToken, data.refreshToken);
      // Clear onboarding phone
      sessionStorage.removeItem('onboarding_phone');
      router.push('/onboarding/username');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Invalid code. Try again or request a new one.',
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setError('');
    const phone = sessionStorage.getItem('onboarding_phone');
    if (!phone) {
      setError('Session expired. Please start over.');
      return;
    }
    setResending(true);
    try {
      await authApi.requestOtp(phone);
      setResendSeconds(30);
      setOtp('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="font-display text-h1 font-semibold text-fg">Verify your phone</h1>
        <p className="mt-2 text-body-sm text-fg-muted">
          We sent a 6-digit code to <strong className="text-fg">{phone}</strong>
        </p>
      </div>

      <OtpInput
        value={otp}
        onChange={setOtp}
        error={error}
        resendSeconds={resendSeconds}
        onResend={handleResend}
      />

      <div className="mt-4 space-y-3">
        <Button fullWidth loading={verifying} onClick={handleVerify} disabled={otp.length !== 6}>
          Verify code
        </Button>
        <Button
          variant="ghost"
          fullWidth
          onClick={handleResend}
          disabled={resendSeconds > 0 || resending}
        >
          {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}
        </Button>
      </div>

      <Banner variant="system" className="mt-4 text-sm">
        Didn&apos;t receive the code? Check your signal or request a new one.
      </Banner>
    </div>
  );
}
