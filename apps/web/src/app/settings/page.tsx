'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authApi, type MeResponse } from '@raise/api-client';
import { Banner, Button, Sheet } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { signOut } from '@/lib/session';

/** +2348031234567 → +234 803 *** 4567: enough to recognise, never the whole number. */
function maskPhone(phone: string): string {
  const m = /^\+234(\d{3})\d+(\d{4})$/.exec(phone);
  return m ? `+234 ${m[1]} *** ${m[2]}` : phone.replace(/\d(?=\d{4})/g, '*');
}

/**
 * Account settings (audit B9): who you are signed in as, theme, a link to notification
 * preferences (email, per-type choices, quiet hours live in Inbox), and signing out of this
 * device or every device.
 */
export default function SettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState<'one' | 'all' | null>(null);

  useEffect(() => {
    authApi
      .me()
      .then(setMe)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Could not load your account.'),
      );
  }, []);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-6">
      <h1 className="font-display text-h1 font-semibold text-fg">Settings</h1>
      {error ? <Banner variant="system">{error}</Banner> : null}

      <section aria-labelledby="account-heading" className="flex flex-col gap-2">
        <h2 id="account-heading" className="label-caps text-fg-muted">
          Account
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
          <dt className="text-fg-muted">Username</dt>
          <dd className="text-fg">{me?.displayName ?? '—'}</dd>
          <dt className="text-fg-muted">Phone</dt>
          <dd className="tabular text-fg">{me ? maskPhone(me.phone) : '—'}</dd>
          <dt className="text-fg-muted">State</dt>
          <dd className="text-fg">{me?.jurisdictionState ?? 'Not set'}</dd>
        </dl>
      </section>

      <section aria-labelledby="appearance-heading" className="flex flex-col gap-2">
        <h2 id="appearance-heading" className="label-caps text-fg-muted">
          Appearance
        </h2>
        <div className="flex items-center justify-between gap-4">
          <p className="text-body-sm text-fg">Theme: dark, light, or follow your phone</p>
          <ThemeToggle />
        </div>
      </section>

      <section aria-labelledby="notifications-heading" className="flex flex-col gap-2">
        <h2 id="notifications-heading" className="label-caps text-fg-muted">
          Notifications
        </h2>
        <p className="text-body-sm text-fg">
          Choose which updates reach you by push or email, set your notification email, and set
          quiet hours.
        </p>
        <div>
          {/* A link styled as a secondary button (never a button inside a link). */}
          <Link
            href="/inbox?tab=preferences"
            className="inline-flex h-11 items-center rounded-control border border-line-strong px-4 font-display text-body-sm font-semibold text-fg hover:bg-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Notification preferences
          </Link>
        </div>
      </section>

      <section aria-labelledby="sessions-heading" className="flex flex-col gap-2">
        <h2 id="sessions-heading" className="label-caps text-fg-muted">
          Sign out
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            loading={busy === 'one'}
            onClick={() => {
              setBusy('one');
              void signOut();
            }}
          >
            Sign out
          </Button>
          <Button variant="danger" onClick={() => setConfirmAll(true)}>
            Sign out of all devices
          </Button>
        </div>
        <p className="text-caption text-fg-muted">
          Lost a phone or used a shared one? Signing out of all devices ends every session,
          including this one.
        </p>
      </section>

      <Sheet
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Sign out of all devices?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmAll(false)}>
              Keep me signed in
            </Button>
            <Button
              variant="danger"
              loading={busy === 'all'}
              onClick={() => {
                setBusy('all');
                void signOut({ everywhere: true });
              }}
            >
              Sign out everywhere
            </Button>
          </div>
        }
      >
        <p className="text-body-sm text-fg">
          Every phone and browser signed in to your account will need to verify again with a code.
          Your matches and results are not affected.
        </p>
      </Sheet>
    </div>
  );
}
