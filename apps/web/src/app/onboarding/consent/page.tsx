'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Banner } from '@/components/ui';
import { consentApi } from '@raise/api-client';

export default function ConsentPage() {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await consentApi.status();
        setTermsAccepted(status.accepted.terms);
        setPrivacyAccepted(status.accepted.privacy);
        if (status.accepted.terms && status.accepted.privacy) {
          router.push('/onboarding/username');
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
      await consentApi.accept({ termsType: 'terms', termsVersion: '1.0' });
      await consentApi.accept({ termsType: 'privacy', termsVersion: '1.0' });
      router.push('/onboarding/username');
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
        <h1 className="font-display text-h1 font-semibold text-fg">Terms & Privacy</h1>
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
                Version 1.0 — [legal] Draft terms for Stage 1.
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
                Version 1.0 — [legal] Draft privacy for Stage 1.
              </p>
            </div>
          </label>
        </div>

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
