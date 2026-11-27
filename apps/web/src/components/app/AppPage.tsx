import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Signed-in page frame: header across the top, then a main column and a rail.
 * Desktop: main + 340px rail (sticky). Below `lg` the rail drops under the main column,
 * so nothing is hidden on phones. Pages without a rail keep the full 1280px width.
 */
export function AppPage({
  header,
  rail,
  children,
  className,
}: {
  header?: ReactNode;
  rail?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-8', className)}>
      {header}
      {rail ? (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-8">{children}</div>
          <aside aria-label="Shortcuts" className="space-y-6 lg:sticky lg:top-[88px]">
            {rail}
          </aside>
        </div>
      ) : (
        <div className="space-y-8">{children}</div>
      )}
    </div>
  );
}

/** Eyebrow-style section title with an optional "View all" link on the right. */
export function SectionHeading({
  id,
  children,
  href,
  linkLabel = 'View all',
}: {
  id?: string;
  children: ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 id={id} className="eyebrow">
        {children}
      </h2>
      {href ? (
        <Link
          href={href}
          className="font-display text-[10px] font-bold uppercase tracking-[0.08em] text-accent hover:underline"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

/** A compact titled card used in the rail. */
export function RailCard({
  title,
  href,
  linkLabel,
  children,
  className,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('surface-card space-y-4 rounded-card p-5', className)}>
      <SectionHeading href={href} linkLabel={linkLabel}>
        {title}
      </SectionHeading>
      {children}
    </section>
  );
}
