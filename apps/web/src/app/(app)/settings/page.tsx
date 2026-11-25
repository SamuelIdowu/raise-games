'use client';

import { useEffect, useState } from 'react';
import { authApi, clearTokens, type MeResponse } from '@raise/api-client';
import { Banner, Button, ButtonLink, Card, PageHeader, Sheet } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import { signOut } from '@/lib/session';
import { closeSocket } from '@/lib/realtime';

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
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /** Audit B28: the export as a JSON file the player keeps. */
  const downloadData = async () => {
    setExporting(true);
    try {
      const data = await authApi.exportMe();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'raise-my-data.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download your data.');
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await authApi.deleteMe(typed.trim());
      clearTokens();
      closeSocket();
      window.location.assign('/');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete the account.');
      setDeleting(false);
    }
  };

  useEffect(() => {
    authApi
      .me()
      .then(setMe)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Could not load your account.'),
      );
  }, []);

  return (
    <div className="flex max-w-[880px] flex-col gap-4">
      <PageHeader eyebrow="Your account" title="Settings" />
      {error ? <Banner variant="system">{error}</Banner> : null}

      <Card as="section" aria-labelledby="account-heading" className="flex flex-col gap-3">
        <h2 id="account-heading" className="eyebrow">
          Account
        </h2>
        <dl className="grid grid-cols-[120px_1fr] items-center gap-x-4 gap-y-3 text-body-sm">
          <dt className="label-caps text-fg-subtle">Username</dt>
          <dd className="text-fg">{me?.displayName ?? '—'}</dd>
          <dt className="label-caps text-fg-subtle">Phone</dt>
          <dd className="tabular text-fg">{me ? maskPhone(me.phone) : '—'}</dd>
          <dt className="label-caps text-fg-subtle">State</dt>
          <dd className="text-fg">{me?.jurisdictionState ?? 'Not set'}</dd>
        </dl>
      </Card>

      <Card as="section" aria-labelledby="appearance-heading" className="flex flex-col gap-3">
        <h2 id="appearance-heading" className="eyebrow">
          Appearance
        </h2>
        <div className="flex items-center justify-between gap-4">
          <p className="text-body-sm text-fg">Theme: dark, light, or follow your phone</p>
          <ThemeToggle />
        </div>
      </Card>

      <Card as="section" aria-labelledby="notifications-heading" className="flex flex-col gap-3">
        <h2 id="notifications-heading" className="eyebrow">
          Notifications
        </h2>
        <p className="text-body-sm text-fg">
          Choose which updates reach you by push or email, set your notification email, and set
          quiet hours.
        </p>
        <div>
          <ButtonLink href="/inbox?tab=preferences" variant="secondary" arrow>
            Notification preferences
          </ButtonLink>
        </div>
      </Card>

      <Card as="section" aria-labelledby="sessions-heading" className="flex flex-col gap-3">
        <h2 id="sessions-heading" className="eyebrow">
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
      </Card>

      <Card as="section" aria-labelledby="data-heading" className="flex flex-col gap-3">
        <h2 id="data-heading" className="eyebrow">
          Your data
        </h2>
        <p className="text-body-sm text-fg">
          Download a copy of everything RAISE holds about you, or delete your account.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={exporting} onClick={() => void downloadData()}>
            Download my data
          </Button>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete account
          </Button>
        </div>
      </Card>

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

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete your account?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep my account
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              disabled={!me?.displayName || typed.trim() !== me.displayName}
              onClick={() => void deleteAccount()}
            >
              Delete account
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 text-body-sm text-fg">
          <p>
            Your phone number, username, email and game IDs are removed and you are signed out
            everywhere. Your open challenges are cancelled. Past matches stay for your
            opponents&apos; records, shown as a deleted player. This cannot be undone.
          </p>
          <p>You cannot delete the account while a match is in progress or disputed.</p>
          <label className="flex flex-col gap-1">
            <span>
              Type your username <strong>{me?.displayName}</strong> to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="h-11 rounded-control border border-line bg-raised px-3 text-body text-fg focus:border-accent focus:outline-none"
            />
          </label>
          {deleteError ? <Banner variant="system">{deleteError}</Banner> : null}
        </div>
      </Sheet>
    </div>
  );
}
