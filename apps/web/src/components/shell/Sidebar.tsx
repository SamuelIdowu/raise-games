'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar, Icon, type IconName } from '@/components/ui';
import { cn } from '@/lib/cn';
import { signOut } from '@/lib/session';
import { useMyProfiles } from '@/lib/app-data';
import { NAV_ITEMS, isActive, useNavBadges } from './BottomNav';
import { useGame } from './GameProvider';
import { Logo } from './TopNav';

const SECONDARY: ReadonlyArray<{ href: string; label: string; icon: IconName }> = [
  { href: '/leaderboard', label: 'Leaderboard', icon: 'medal' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
  { href: '/feedback', label: 'Send feedback', icon: 'flag' },
];

export const SIDEBAR_WIDTH = 'lg:pl-[248px]';

function NavLink({
  href,
  label,
  icon,
  badge,
  badgeLabel,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
  badgeLabel?: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-10 items-center gap-3 rounded-control px-3 font-display text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
        active ? 'bg-accent-subtle text-fg' : 'text-fg-subtle hover:bg-surface hover:text-fg',
      )}
    >
      {active ? (
        <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
      ) : null}
      <Icon name={icon} size={18} className={active ? 'text-accent' : undefined} />
      <span className="flex-1">{label}</span>
      {badge && badge > 0 ? (
        <span
          className="min-w-5 rounded-sm bg-accent px-1.5 text-center text-[10px] leading-5 text-on-accent tabular"
          aria-label={`${badge} ${badgeLabel ?? ''}`}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  );
}

/** The navigation list, shared by the desktop sidebar and the mobile menu sheet. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? '';
  const badges = useNavBadges();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          {...item}
          active={isActive(pathname, item.href)}
          badge={badges[item.href]}
          badgeLabel={item.href === '/inbox' ? 'unread' : 'need your action'}
          onNavigate={onNavigate}
        />
      ))}
      <div className="my-3 h-px bg-line" />
      {SECONDARY.map((item) => (
        <NavLink
          key={item.href}
          {...item}
          active={isActive(pathname, item.href)}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

/** Who is signed in, with their rating in the current game. */
export function PlayerCard() {
  const { currentGame } = useGame();
  const { data } = useMyProfiles();
  const profile = data?.find((p) => p.gameKey === currentGame) ?? data?.[0];
  const name = data?.[0]?.displayName ?? 'Player';
  return (
    <Link
      href="/profile"
      className="flex items-center gap-3 rounded-control p-2 transition-colors hover:bg-surface"
    >
      <Avatar username={name} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-sm font-semibold text-fg">{name}</span>
        <span className="block truncate text-caption text-fg-subtle tabular">
          {profile ? `${profile.rating.toLocaleString()} · ${profile.rankLabel}` : 'No games yet'}
        </span>
      </span>
    </Link>
  );
}

/**
 * Desktop dashboard sidebar: logo, primary nav with badges, secondary links, the signed-in
 * player and sign out. Hidden below lg, where the top bar menu and bottom nav take over.
 */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-nav hidden w-[248px] flex-col border-r border-line bg-bg-subtle lg:flex">
      <div className="flex h-16 items-center border-b border-line px-5">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <SidebarNav />
      </div>
      <div className="space-y-1 border-t border-line p-3">
        <PlayerCard />
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex h-10 w-full items-center gap-3 rounded-control px-3 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-fg-subtle transition-colors hover:bg-surface hover:text-fg"
        >
          <Icon name="log-out" size={18} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
