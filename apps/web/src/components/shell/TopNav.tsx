'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ButtonLink, Icon, Sheet } from '@/components/ui';
import { cn } from '@/lib/cn';
import { signOut } from '@/lib/session';
import { NAV_ITEMS, NavBadge, isActive, useNavBadges } from './BottomNav';
import { GameSwitcher } from './GameSwitcher';

/** Blocks.fun §7.1: pixel "X" cluster mark + display wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/home"
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

/**
 * Blocks.fun §7.2 header: 72px, hairline bottom border, logo | separator | nav.
 * Nav items are uppercase labels; the active one is white with a 2px purple
 * underline sitting on the header border. Right: caption + game chip + CTA.
 */
export function TopNav() {
  const pathname = usePathname() ?? '';
  const badges = useNavBadges();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-nav border-b border-line bg-bg">
      <div className="flex h-14 items-stretch gap-4 px-4 lg:h-[72px] lg:gap-6 lg:px-12">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="-ml-2 inline-flex size-11 items-center justify-center text-fg lg:hidden"
          >
            <Icon name="menu" size={22} />
          </button>
          <Logo />
        </div>

        <span aria-hidden className="hidden w-px self-stretch bg-line lg:block" />

        <nav aria-label="Primary" className="hidden items-stretch gap-8 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative -mb-px flex items-center border-b-2 font-display text-[11px] font-bold uppercase tracking-[0.08em] transition-colors duration-[var(--motion-micro)]',
                  active
                    ? 'border-accent text-fg'
                    : 'border-transparent text-fg-subtle hover:text-fg',
                )}
              >
                <span className="relative">
                  {item.label}
                  <NavBadge
                    count={badges[item.href] ?? 0}
                    label={item.href === '/inbox' ? 'unread' : 'need your action'}
                  />
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <p className="hidden max-w-[150px] text-right text-[10px] leading-tight text-fg-disabled xl:block">
            Free 1v1 challenges. Settle every result with proof.
          </p>
          <GameSwitcher />
          <Link
            href="/settings"
            aria-label="Settings"
            className={cn(
              'hidden size-9 items-center justify-center rounded-control border border-line text-fg-subtle transition-colors hover:border-line-strong hover:text-fg lg:inline-flex',
              isActive(pathname, '/settings') && 'border-accent text-fg',
            )}
          >
            <Icon name="settings" size={18} />
          </Link>
          <ButtonLink
            href="/play?create=1"
            variant="secondary"
            arrow
            className="hidden lg:inline-flex"
          >
            Create challenge
          </ButtonLink>
        </div>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Menu" size="sm">
        <nav aria-label="Mobile" className="flex flex-col">
          {[
            ...NAV_ITEMS,
            { href: '/settings', label: 'Settings', icon: 'settings' as const },
            { href: '/feedback', label: 'Send feedback', icon: 'flag' as const },
          ].map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 items-center justify-between border-b border-line font-display text-[20px] font-black uppercase tracking-[-0.01em]',
                  active ? 'text-accent' : 'text-fg',
                )}
              >
                {item.label}
                <Icon name="chevron-right" size={18} className="text-fg-subtle" />
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex min-h-14 items-center font-display text-[20px] font-black uppercase tracking-[-0.01em] text-fg-subtle"
          >
            Sign out
          </button>
          <ButtonLink
            href="/play?create=1"
            variant="secondary"
            arrow
            fullWidth
            className="mt-6"
            onClick={() => setOpen(false)}
          >
            Create challenge
          </ButtonLink>
        </nav>
      </Sheet>
    </header>
  );
}
