'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Banner } from '@/components/ui';
import { consentApi } from '@raise/api-client';

/** Where to go after accepting: a same-site path from `?next=` (set by the play gate), else onboarding. */
function nextPath(): string {
  if (typeof window === 'undefined') return '/onboarding/username';
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/onboarding/username';
}

export default function ConsentPage() {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [versions, setVersions] = useState<{ terms: string; privacy: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await consentApi.status();
        setVersions(status.current);
        setTermsAccepted(status.accepted.terms);
        setPrivacyAccepted(status.accepted.privacy);
        if (status.accepted.terms && status.accepted.privacy) {
          router.push(nextPath());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load consent status');
      } finally {
        setLoading(false);
      }
    };
    checkStatus();
  }, [router]);

  const handleAccept = async () => {
    if (!termsAccepted || !privacyAccepted) {
      setError('You must accept both Terms of Service and Privacy Policy');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Accept the versions the API says are current, so a new terms version can be re-accepted.
      const current = versions ?? (await consentApi.status()).current;
      await consentApi.accept({ termsType: 'terms', termsVersion: current.terms });
      await consentApi.accept({ termsType: 'privacy', termsVersion: current.privacy });
      router.push(nextPath());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept consent');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="text-center">
          <p className="text-body-sm text-fg-muted">Loading consent status…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="font-display text-mk-h1 uppercase text-fg text-balance">Terms & Privacy</h1>
        <p className="mt-2 text-body-sm text-fg-muted">Please review and accept to continue</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAccept();
        }}
        className="space-y-4"
      >
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-1 h-4 w-4 rounded-control border-line text-accent focus:ring-accent"
              required
            />
            <div className="text-left">
              <p className="font-display text-body-sm font-semibold text-fg">Terms of Service</p>
              <p className="text-caption text-fg-muted">
                Version {versions?.terms ?? '…'} ·{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener"
                  className="text-accent hover:underline"
                >
                  Read the terms
                </a>
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(e) => setPrivacyAccepted(e.target.checked)}
              className="mt-1 h-4 w-4 rounded-control border-line text-accent focus:ring-accent"
              required
            />
            <div className="text-left">
              <p className="font-display text-body-sm font-semibold text-fg">Privacy Policy</p>
              <p className="text-caption text-fg-muted">
                Version {versions?.privacy ?? '…'} ·{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener"
                  className="text-accent hover:underline"
                >
                  Read the privacy policy
                </a>
              </p>
            </div>
          </label>
        </div>

        <p className="text-caption text-fg-muted">
          The terms include the{' '}
          <a
            href="/community-rules"
            target="_blank"
            rel="noopener"
            className="text-accent hover:underline"
          >
            community rules
          </a>
          : how results, disputes and sanctions work.
        </p>

        {error && (
          <Banner variant="system" className="text-sm">
            {error}
          </Banner>
        )}

        <Button
          type="submit"
          fullWidth
          loading={saving}
          className="mt-2"
          disabled={!termsAccepted || !privacyAccepted}
        >
          Accept & Continue
        </Button>
      </form>
    </div>
  );
}
