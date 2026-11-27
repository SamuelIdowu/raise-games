'use client';

import { useEffect } from 'react';
import { Button, ButtonLink, Banner } from '@/components/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <span className="font-display text-[72px] font-bold text-danger">!</span>
        <h1 className="mt-4 font-display text-mk-h1 uppercase text-fg text-balance">
          Something went wrong
        </h1>
        <p className="mt-2 text-body-sm text-fg-muted">
          We&apos;ve logged this error. Please try again.
        </p>
      </div>
      <Banner variant="system" className="w-full max-w-xs">
        <code className="font-mono text-caption text-fg-muted">
          {error.digest ?? error.message}
        </code>
      </Banner>
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <Button onClick={reset} fullWidth>
          Try again
        </Button>
        <ButtonLink href="/" variant="secondary" fullWidth>
          Go home
        </ButtonLink>
      </div>
    </main>
  );
}
