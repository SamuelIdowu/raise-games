'use client';

import { useEffect } from 'react';
import { Button, ButtonLink, Banner } from '@/components/ui';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Critical application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Error — RAISE</title>
      </head>
      <body className="bg-bg text-fg min-h-screen flex items-center justify-center">
        <main className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-6 px-4">
          <div className="text-center">
            <span className="font-display text-[72px] font-bold text-danger">!</span>
            <h1 className="mt-4 font-display text-mk-h1 uppercase text-fg text-balance">
              A critical error occurred
            </h1>
            <p className="mt-2 text-body-sm text-fg-muted">
              The application failed to start. Please refresh the page.
            </p>
          </div>
          <Banner variant="system" className="w-full max-w-xs">
            <code className="font-mono text-caption text-fg-muted">
              {error.digest ?? error.message}
            </code>
          </Banner>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <Button onClick={reset} fullWidth>
              Refresh page
            </Button>
            <ButtonLink href="/" variant="secondary" fullWidth>
              Go home
            </ButtonLink>
          </div>
        </main>
      </body>
    </html>
  );
}
