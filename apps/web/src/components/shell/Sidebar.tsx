'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar, Icon, type IconName } from '@/components/ui';
import { cn } from '@/lib/cn';
import { signOut } from '@/lib/session';
import { useMyProfiles } from '@/lib/app-data';
import { NAV_ITEMS, isActive, useNavBadges } from './BottomNav';
import { useGame } from './GameProvider';
import { useSidebarCollapsed } from './sidebar-state';
import { Logo } from './TopNav';

const SECONDARY: ReadonlyArray<{ href: string; label: string; icon: IconName }> = [
  { href: '/leaderboard', label: 'Leaderboard', icon: 'medal' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
  { href: '/feedback', label: 'Send feedback', icon: 'flag' },
];

const rowText = 'font-display text-[10px] font-bold uppercase tracking-[0.08em]';

function NavLink({
  href,
  label,
  icon,
  badge,
  badgeLabel,
  active,
  collapsed = false,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
  badgeLabel?: string;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const count = badge && badge > 0 ? (badge > 99 ? '99+' : String(badge)) : null;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={
        collapsed ? (count ? `${label}, ${badge} ${badgeLabel ?? ''}` : label) : undefined
      }
      title={collapsed ? label : undefined}
      className={cn(
        'group relative flex h-9 items-center gap-3 rounded-control transition-colors',
        rowText,
        collapsed ? 'justify-center px-0' : 'px-3',
        active ? 'bg-accent-subtle text-fg' : 'text-fg-subtle hover:bg-surface hover:text-fg',
      )}
    >
      {active ? (
        <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
      ) : null}
      <span className="relative shrink-0">
        <Icon name={icon} size={16} className={active ? 'text-accent' : undefined} />
        {collapsed && count ? (
          <span
            aria-hidden
            className="absolute -right-2 -top-1.5 min-w-3.5 rounded-sm bg-accent px-0.5 text-center text-[9px] leading-3.5 text-on-accent tabular"
          >
            {count}
          </span>
        ) : null}
      </span>
      {collapsed ? null : <span className="flex-1 truncate">{label}</span>}
      {!collapsed && count ? (
        <span
          className="min-w-5 rounded-sm bg-accent px-1.5 text-center text-[10px] leading-5 text-on-accent tabular"
          aria-label={`${badge} ${badgeLabel ?? ''}`}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

/** The navigation list, shared by the desktop sidebar and the mobile menu sheet. */
export function SidebarNav({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname() ?? '';
  const badges = useNavBadges();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.href}
          {...item}
          active={isActive(pathname, item.href)}
          badge={badges[item.href]}
          badgeLabel={item.href === '/inbox' ? 'unread' : 'need your action'}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
      <div className="my-2.5 h-px bg-line" />
      {SECONDARY.map((item) => (
        <NavLink
          key={item.href}
          {...item}
          active={isActive(pathname, item.href)}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

/** Who is signed in, with their rating in the current game. */
export function PlayerCard({ collapsed = false }: { collapsed?: boolean }) {
  const { currentGame } = useGame();
  const { data } = useMyProfiles();
  const profile = data?.find((p) => p.gameKey === currentGame) ?? data?.[0];
  const name = data?.[0]?.displayName ?? 'Player';
  return (
    <Link
      href="/profile"
      aria-label={collapsed ? `${name}, your profile` : undefined}
      title={collapsed ? name : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-control p-1.5 transition-colors hover:bg-surface',
        collapsed && 'justify-center',
      )}
    >
      <Avatar username={name} size={32} />
      {collapsed ? null : (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-fg">{name}</span>
          <span className="block truncate text-[11px] text-fg-subtle tabular">
            {profile ? `${profile.rating.toLocaleString()} · ${profile.rankLabel}` : 'No games yet'}
          </span>
        </span>
      )}
    </Link>
  );
}

/**
 * Desktop dashboard sidebar: logo, primary nav with badges, secondary links, the signed-in
 * player and sign out. Collapses to a 64px icon rail (remembered per browser). Hidden below
 * lg, where the top bar menu and bottom nav take over. Width comes from --sidebar-w, set by
 * the shell so the content column moves with it.
 */
export function Sidebar() {
  const [collapsed, toggle] = useSidebarCollapsed();
  return (
    <aside
      className="fixed inset-y-0 left-0 z-nav hidden w-[var(--sidebar-w)] flex-col border-r border-line bg-bg-subtle transition-[width] duration-[var(--motion-default)] ease-standard lg:flex"
      aria-label="Sidebar"
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-line',
          collapsed ? 'justify-center' : 'justify-between pl-4 pr-2',
        )}
      >
        {collapsed ? (
          <Logo compact />
        ) : (
          <>
            <Logo />
            <button
              type="button"
              onClick={toggle}
              aria-label="Collapse sidebar"
              aria-expanded
              title="Collapse sidebar"
              className="inline-flex size-8 items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface hover:text-fg"
            >
              <Icon name="chevron-left" size={16} />
            </button>
          </>
        )}
      </div>
      <div className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-2.5')}>
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className={cn('space-y-0.5 border-t border-line', collapsed ? 'p-2' : 'p-2.5')}>
        <PlayerCard collapsed={collapsed} />
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label={collapsed ? 'Sign out' : undefined}
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'flex h-9 w-full items-center gap-3 rounded-control text-fg-subtle transition-colors hover:bg-surface hover:text-fg',
            rowText,
            collapsed ? 'justify-center' : 'px-3',
          )}
        >
          <Icon name="log-out" size={16} />
          {collapsed ? null : 'Sign out'}
        </button>
        {collapsed ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand sidebar"
            aria-expanded={false}
            title="Expand sidebar"
            className="flex h-9 w-full items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface hover:text-fg"
          >
            <Icon name="chevron-right" size={16} />
          </button>
        ) : null}
      </div>
    </aside>
  );
}
