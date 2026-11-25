'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';

/** Blocks.fun §7.1: pixel "X" cluster mark + display wordmark. */
export function Logo({ className, href = '/home' }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn('flex shrink-0 items-center gap-2', className)}
      aria-label="RAISE home"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 10 10"
        shapeRendering="crispEdges"
        aria-hidden
        className="drop-hard-sm text-accent [--hard-ink:var(--accent-ink)]"
      >
        <path fill="currentColor" d="M0 0h3v3H0zM7 0h3v3H7zM3 3h4v4H3zM0 7h3v3H0zM7 7h3v3H7z" />
      </svg>
      <span className="font-display text-[18px] font-black uppercase leading-none tracking-[-0.02em] text-fg">
        Raise
      </span>
    </Link>
  );
}
