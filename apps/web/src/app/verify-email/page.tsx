'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { notificationsApi } from '@raise/api-client';
import { Banner, Icon, SkeletonCard } from '@/components/ui';

/**
 * Opened from the confirmation email (audit #3). The token alone is the proof, so this works
 * on any device, signed in or not. The token is sent once; a refresh after success shows the
 * API's "already used" message, which is accurate.
 */
function VerifyEmail() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'working' | 'done' | 'failed'>(token ? 'working' : 'failed');
  const [message, setMessage] = useState(token ? '' : 'This link is missing its code.');
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    notificationsApi
      .confirmEmail(token)
      .then(() => setState('done'))
      .catch((e: unknown) => {
        setState('failed');
        setMessage(e instanceof Error ? e.message : 'This link could not be used.');
      });
  }, [token]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
      <h1 className="font-display text-mk-h1 uppercase text-fg text-balance">Confirm your email</h1>
      {state === 'working' ? <p className="text-body-sm text-fg-muted">Confirming…</p> : null}
      {state === 'done' ? (
        <p className="flex items-center gap-2 text-body text-fg">
          <Icon name="check-circle" size={20} aria-hidden /> Your email is confirmed. Notifications
          you chose to get by email will now arrive there.
        </p>
      ) : null}
      {state === 'failed' ? <Banner variant="system">{message}</Banner> : null}
      <Link href="/inbox?tab=preferences" className="text-body-sm text-accent hover:underline">
        Notification preferences
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<SkeletonCard />}>
      <VerifyEmail />
    </Suspense>
  );
}
