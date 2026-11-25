'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Avatar, ButtonLink, Icon, Sheet } from '@/components/ui';
import { signOut } from '@/lib/session';
import { useBadges } from '@/lib/badges';
import { useMyProfiles } from '@/lib/app-data';
import { GameSwitcher } from './GameSwitcher';
import { PlayerCard, SidebarNav } from './Sidebar';
import { Logo } from './TopNav';

/**
 * Dashboard top bar. Desktop: game switcher on the left; Create challenge, inbox bell and
 * the player avatar on the right (the sidebar carries navigation). Below lg: menu button
 * and logo, with the same nav in a sheet.
 */
export function AppTopBar() {
  const [open, setOpen] = useState(false);
  const { unread } = useBadges();
  const { data } = useMyProfiles();
  const name = data?.[0]?.displayName ?? 'Player';

  return (
    <header className="sticky top-0 z-nav border-b border-line bg-bg">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-8">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="-ml-2 inline-flex size-11 items-center justify-center text-fg lg:hidden"
        >
          <Icon name="menu" size={22} />
        </button>
        <div className="lg:hidden">
          <Logo />
        </div>

        <div className="hidden lg:block">
          <GameSwitcher />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="lg:hidden">
            <GameSwitcher compact />
          </div>
          <div className="hidden sm:block">
            <ButtonLink href="/play?create=1" arrow>
              Create challenge
            </ButtonLink>
          </div>
          <Link
            href="/inbox"
            aria-label={unread > 0 ? `Inbox, ${unread} unread` : 'Inbox'}
            className="relative inline-flex size-10 items-center justify-center rounded-control border border-line text-fg-subtle transition-colors hover:border-line-strong hover:text-fg"
          >
            <Icon name="bell" size={18} />
            {unread > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-4 rounded-sm bg-accent px-1 text-center text-[10px] leading-4 text-on-accent tabular">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </Link>
          <Link
            href="/profile"
            aria-label="Your profile"
            className="hidden rounded-control p-0.5 ring-accent transition hover:ring-2 lg:block"
          >
            <Avatar username={name} size={32} />
          </Link>
        </div>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Menu" size="sm">
        <div className="flex flex-col gap-4">
          <PlayerCard />
          <SidebarNav onNavigate={() => setOpen(false)} />
          <ButtonLink href="/play?create=1" fullWidth arrow onClick={() => setOpen(false)}>
            Create challenge
          </ButtonLink>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-10 items-center gap-3 px-3 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-fg-subtle hover:text-fg"
          >
            <Icon name="log-out" size={18} />
            Sign out
          </button>
        </div>
      </Sheet>
    </header>
  );
}

const FOOTER_LINKS = [
  { href: '/community-rules', label: 'Community rules' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/status', label: 'Status' },
] as const;

/** One-line app footer: the dashboard keeps the full marketing footer for the public site. */
export function AppFooter() {
  return (
    <footer className="mt-16 border-t border-line px-4 py-6 pb-24 lg:px-8 lg:pb-6">
      <div className="flex flex-col gap-3 text-caption text-fg-subtle md:flex-row md:items-center md:justify-between">
        <p>© 2026 RAISE · Free to play. No deposits, no withdrawals.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-fg">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
