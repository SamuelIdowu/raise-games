'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <span className="font-display text-[72px] font-bold text-accent">404</span>
        <h1 className="mt-4 font-display text-h1 font-semibold text-fg">Page not found</h1>
        <p className="mt-2 text-body-sm text-fg-muted">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <Link href="/">
          <Button fullWidth>Go home</Button>
        </Link>
        <Link href="/play">
          <Button variant="secondary" fullWidth>
            Browse challenges
          </Button>
        </Link>
      </div>
    </main>
  );
}
