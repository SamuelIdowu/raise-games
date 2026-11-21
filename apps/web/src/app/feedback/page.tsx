'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { betaApi } from '@raise/api-client';
import { Banner, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

const KINDS = [
  { value: 'bug', label: 'Something is broken' },
  { value: 'idea', label: 'An idea' },
  { value: 'other', label: 'Something else' },
] as const;

const MAX = 2000;

/**
 * Beta feedback (Sprint 16, F16.3). The page the player came from and the app version are
 * attached automatically; staff triage it by severity in /admin/feedback.
 */
export default function FeedbackPage() {
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('bug');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const id = useId();

  /** The in-app page the player came from (never an external referrer). */
  const cameFrom = () => {
    try {
      const u = new URL(document.referrer);
      return u.origin === window.location.origin ? u.pathname : undefined;
    } catch {
      return undefined;
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim().length < 3) {
      setError('Tell us a little more.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await betaApi.sendFeedback({
        kind,
        body: body.trim(),
        page: cameFrom(),
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send feedback.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <h1 className="font-display text-h1 font-semibold text-fg">Thanks</h1>
        <p className="text-body text-fg">
          We read every report during the beta. If it’s about a match result, open a dispute from
          the match too, so a moderator can fix the result itself.
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setBody('');
              setSent(false);
            }}
          >
            Send another
          </Button>
          <Link
            href="/play"
            className="inline-flex min-h-11 items-center px-3 text-body-sm font-semibold text-accent hover:underline"
          >
            Back to Play
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-[560px] flex-col gap-4">
      <h1 className="font-display text-h1 font-semibold text-fg">Send feedback</h1>
      <p className="text-body-sm text-fg-muted">
        You’re part of the RAISE beta. Tell us what broke, what confused you, or what you’d change.
      </p>

      <fieldset>
        <legend className="mb-2 text-body-sm font-semibold text-fg">What is it about?</legend>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3 text-body-sm',
                kind === k.value ? 'border-accent text-fg' : 'border-line text-fg-muted',
              )}
            >
              <input
                type="radio"
                name={`${id}-kind`}
                value={k.value}
                checked={kind === k.value}
                onChange={() => setKind(k.value)}
                className="size-4 accent-[var(--accent)]"
              />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${id}-body`} className="mb-1 block text-body-sm font-semibold text-fg">
          Details
        </label>
        <textarea
          id={`${id}-body`}
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX))}
          rows={6}
          aria-describedby={`${id}-help`}
          aria-invalid={error ? true : undefined}
          className="block w-full rounded-control border border-line bg-raised px-3 py-2.5 text-body text-fg focus:border-accent focus:outline-none"
          placeholder="What happened, and what did you expect?"
        />
        <p id={`${id}-help`} className="mt-1 text-caption text-fg-subtle">
          Please don’t include passwords or codes. {body.length}/{MAX}
        </p>
      </div>

      {error ? <Banner variant="system">{error}</Banner> : null}

      <Button type="submit" loading={busy}>
        Send feedback
      </Button>
    </form>
  );
}
