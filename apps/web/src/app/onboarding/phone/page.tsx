'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Banner } from '@/components/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export default function PhoneEntryPage() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    interface TurnstileWidget {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
        },
      ) => void;
    }
    const turnstile = (window as Window & { turnstile?: TurnstileWidget }).turnstile;
    if (typeof window !== 'undefined' && TURNSTILE_SITE_KEY && turnstileRef.current) {
      if (turnstile) {
        turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
          'expired-callback': () => setTurnstileToken(''),
        });
      }
    }
  }, []);

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
      const res = await fetch(`${API_URL}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleaned, turnstileToken: turnstileToken || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? 'Failed to send code');
      }
      // Store phone for OTP page
      sessionStorage.setItem('onboarding_phone', cleaned);
      router.push('/onboarding/otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
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
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      )}
    </div>
  );
}
