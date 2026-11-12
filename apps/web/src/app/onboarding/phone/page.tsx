'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { Button, Input, Banner } from '@/components/ui';
import { authApi } from '@raise/api-client';

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

interface TurnstileGlobal {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
    },
  ) => number;
  reset: (widgetId: number) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

export default function PhoneEntryPage() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const router = useRouter();

  const resetTurnstile = useCallback(() => {
    if (typeof window !== 'undefined' && window.turnstile && widgetIdRef.current !== null) {
      window.turnstile.reset(widgetIdRef.current);
      setTurnstileToken('');
    }
  }, []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    // Script component handles loading; we just need to know when it's ready.
    // We'll use a simple interval to check for turnstile global.
    const interval = setInterval(() => {
      if (window.turnstile) {
        setTurnstileReady(true);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (turnstileReady && TURNSTILE_SITE_KEY && turnstileRef.current) {
      const turnstile = window.turnstile;
      if (turnstile && turnstileRef.current) {
        widgetIdRef.current = turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
          'expired-callback': () => setTurnstileToken(''),
        });
      }
    }
  }, [turnstileReady]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleaned = phone.replace(/\D/g, '');
    if (!/^0[789]\d{9}$/.test(cleaned)) {
      setError('Enter a valid Nigerian mobile number (e.g., 0801 234 5678)');
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError('Please complete the security check');
      return;
    }
    setSending(true);
    try {
      await authApi.requestOtp(cleaned, turnstileToken || undefined);
      // If turnstile required but not provided, backend will throw error handled below.
      // Store phone for OTP page
      sessionStorage.setItem('onboarding_phone', cleaned);
      resetTurnstile();
      router.push('/onboarding/otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
      resetTurnstile();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="font-display text-h1 font-semibold text-fg">Welcome to Raise</h1>
        <p className="mt-2 text-body-sm text-fg-muted">Enter your phone to get started</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Phone number"
          placeholder="0801 234 5678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="numeric"
          error={error}
          helper="We'll send a 6-digit code via SMS"
          autoComplete="tel"
        />

        {TURNSTILE_SITE_KEY && <div ref={turnstileRef} className="mx-auto max-w-[300px]" />}

        <Banner variant="system" className="text-sm">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </Banner>

        <Button type="submit" fullWidth loading={sending} className="mt-2">
          Send code
        </Button>
      </form>

      <p className="mt-6 text-center text-caption text-fg-muted">
        SMS rates may apply. Standard messaging rates apply.
      </p>
      {TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
        />
      )}
    </div>
  );
}
