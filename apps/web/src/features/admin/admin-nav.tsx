'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/disputes', label: 'Disputes' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/signals', label: 'Fraud signals' },
  { href: '/admin/users', label: 'Players' },
  { href: '/admin/metrics', label: 'Beta metrics' },
  { href: '/admin/beta', label: 'Invites' },
  { href: '/admin/feedback', label: 'Feedback' },
  { href: '/admin/flags', label: 'Flags' },
  { href: '/admin/games', label: 'Games' },
  { href: '/admin/audit', label: 'Audit log' },
];

function Links() {
  const path = usePathname();
  return (
    <>
      {ITEMS.map((item) => {
        const active = item.href === '/admin' ? path === '/admin' : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 font-display text-body-sm font-semibold',
              active
                ? 'border-accent text-accent'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function AdminNav() {
  return (
    <nav
      aria-label="Moderator tools"
      className="-mx-4 flex overflow-x-auto border-b border-line px-4"
    >
      {/* usePathname under Cache Components needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <Links />
      </Suspense>
    </nav>
  );
}
