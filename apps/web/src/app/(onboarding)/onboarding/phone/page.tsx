'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { Button, Input, Banner } from '@/components/ui';
import { ApiError, authApi, betaApi } from '@raise/api-client';
import { normalizeNigerianPhone, phoneError } from '@raise/schemas';

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
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  // Closed beta (Sprint 16): new numbers need an invite while the gate is on.
  const [inviteOnly, setInviteOnly] = useState(false);
  const [invite, setInvite] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [waitlist, setWaitlist] = useState<'closed' | 'open' | 'joined'>('closed');
  const [place, setPlace] = useState('');

  useEffect(() => {
    betaApi
      .status()
      .then((s) => setInviteOnly(s.inviteOnly))
      .catch(() => undefined);
  }, []);

  const joinWaitlist = async () => {
    setError('');
    setPhoneTouched(true);
    const problem = phoneError(phone);
    if (problem) {
      setError(problem);
      return;
    }
    // Local 0XXXXXXXXXX form, whatever the player typed (+234…, 234…, spaces).
    const cleaned = '0' + normalizeNigerianPhone(phone)!.slice(4);
    setSending(true);
    try {
      await betaApi.joinWaitlist(cleaned, place.trim() || undefined);
      setWaitlist('joined');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the waitlist');
    } finally {
      setSending(false);
    }
  };
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
    setPhoneTouched(true);
    const problem = phoneError(phone);
    if (problem) {
      setError(problem);
      return;
    }
    // Local 0XXXXXXXXXX form, whatever the player typed (+234…, 234…, spaces).
    const cleaned = '0' + normalizeNigerianPhone(phone)!.slice(4);
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError('Please complete the security check');
      return;
    }
    setSending(true);
    setInviteError('');
    try {
      await authApi.requestOtp(cleaned, turnstileToken || undefined, invite.trim() || undefined);
      // If turnstile required but not provided, backend will throw error handled below.
      // Store phone (and the invite, needed again when the account is created) for OTP page
      sessionStorage.setItem('onboarding_phone', cleaned);
      // Where to return after sign-in (set when an expired session sent the player here).
      const next = new URLSearchParams(window.location.search).get('next');
      if (next && next.startsWith('/') && !next.startsWith('//')) {
        sessionStorage.setItem('onboarding_next', next);
      }
      if (invite.trim()) sessionStorage.setItem('onboarding_invite', invite.trim());
      else sessionStorage.removeItem('onboarding_invite');
      resetTurnstile();
      router.push('/onboarding/otp');
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.reason === 'invite_required' || err.reason === 'invite_invalid')
      ) {
        setInviteOnly(true);
        setInviteError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to send code');
      }
      resetTurnstile();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="font-display text-mk-h1 uppercase text-fg text-balance">Welcome to Raise</h1>
        <p className="mt-2 text-body-sm text-fg-muted">Enter your phone to get started</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Phone number"
          placeholder="0801 234 5678"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setError('');
          }}
          onBlur={() => setPhoneTouched(true)}
          inputMode="tel"
          type="tel"
          maxLength={18}
          error={
            error || (phoneTouched && phone.trim() ? (phoneError(phone) ?? undefined) : undefined)
          }
          helper="We'll send a 6-digit code via SMS"
          autoComplete="tel"
        />

        {inviteOnly && waitlist === 'closed' ? (
          <div className="space-y-1">
            <Input
              label="Invite code"
              placeholder="ABCD 2345"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              error={inviteError || undefined}
              helper="RAISE is in a closed beta. New players need an invite code. Already have an account? Leave this empty."
            />
            <button
              type="button"
              onClick={() => setWaitlist('open')}
              className="min-h-11 text-body-sm font-semibold text-accent hover:underline"
            >
              No code? Join the waitlist
            </button>
          </div>
        ) : null}

        {waitlist === 'open' ? (
          <section
            aria-labelledby="waitlist-heading"
            className="space-y-3 surface-card rounded-card p-4"
          >
            <h2 id="waitlist-heading" className="font-display text-h3 font-black uppercase text-fg">
              Join the waitlist
            </h2>
            <p className="text-body-sm text-fg-muted">
              We’ll text this number when a place opens. We keep it for up to 90 days.
            </p>
            <Input
              label="Campus or city (optional)"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              maxLength={80}
            />
            <div className="flex gap-2">
              <Button type="button" loading={sending} onClick={() => void joinWaitlist()}>
                Join the waitlist
              </Button>
              <Button type="button" variant="ghost" onClick={() => setWaitlist('closed')}>
                I have a code
              </Button>
            </div>
          </section>
        ) : null}

        {waitlist === 'joined' ? (
          <Banner variant="system">
            You’re on the waitlist. We’ll text you when a place opens.
          </Banner>
        ) : null}

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
