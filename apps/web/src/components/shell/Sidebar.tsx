'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, Icon, Sheet, type IconName } from '@/components/ui';
import { cn } from '@/lib/cn';
import { NAV_ITEMS, NavBadge, useNavBadges, type NavItem } from './BottomNav';
import { signOut } from '@/lib/session';

/** Blocks.fun §7.1: orange pixel "X" mark + display wordmark. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/home" className="flex items-center gap-2" aria-label="RAISE home">
      <svg
        width="20"
        height="20"
        viewBox="0 0 10 10"
        shapeRendering="crispEdges"
        aria-hidden
        className="shrink-0 text-accent"
      >
        <path fill="currentColor" d="M0 0h3v3H0zM7 0h3v3H7zM3 3h4v4H3zM0 7h3v3H0zM7 7h3v3H7z" />
      </svg>
      {!compact && (
        <span className="font-display text-[18px] font-black uppercase leading-none tracking-[-0.02em] text-fg">
          Raise
        </span>
      )}
    </Link>
  );
}

function isActive(pathname: string, href: string) {
  return href === '/home'
    ? pathname === '/home' || pathname === '/'
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** Uppercase label nav row; active = white text + 2px orange bar on the left edge. */
function navRowClass(active: boolean, collapsed: boolean) {
  return cn(
    'relative flex min-h-11 items-center gap-3 px-4 font-body text-mk-label uppercase',
    'transition-colors duration-[var(--motion-micro)]',
    'before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-accent before:transition-opacity',
    active
      ? 'text-fg before:opacity-100'
      : 'text-fg-subtle before:opacity-0 hover:bg-overlay/60 hover:text-fg',
    collapsed && 'justify-center px-0',
  );
}

function NavRow({
  href,
  icon,
  label,
  active,
  collapsed,
  badge,
  onClick,
}: {
  href: string;
  icon: IconName;
  label: string;
  active: boolean;
  collapsed: boolean;
  badge?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      className={navRowClass(active, collapsed)}
      onClick={onClick}
    >
      <span className={cn('relative shrink-0', active && 'text-accent')}>
        <Icon name={icon} size={20} />
        {badge}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const badges = useNavBadges();

  return (
    <>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto py-3" aria-label="Primary">
        {NAV_ITEMS.map((item: NavItem) => (
          <NavRow
            key={item.href}
            href={item.href}
            icon={item.icon as IconName}
            label={item.label}
            active={isActive(pathname, item.href)}
            collapsed={collapsed}
            onClick={onNavigate}
            badge={
              <NavBadge
                count={badges[item.href] ?? 0}
                label={item.href === '/inbox' ? 'unread' : 'need your action'}
              />
            }
          />
        ))}
      </nav>
      <div className="flex flex-col gap-0.5 border-t border-line py-3">
        <NavRow
          href="/settings"
          icon="settings"
          label="Settings"
          active={isActive(pathname, '/settings')}
          collapsed={collapsed}
          onClick={onNavigate}
        />
        {/* Sprint 16: beta feedback, one tap from anywhere. */}
        <NavRow
          href="/feedback"
          icon="flag"
          label="Send feedback"
          active={isActive(pathname, '/feedback')}
          collapsed={collapsed}
          onClick={onNavigate}
        />
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label={collapsed ? 'Sign out' : undefined}
          className={cn(navRowClass(false, collapsed), 'text-left')}
        >
          <Icon name="log-out" size={20} aria-hidden />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Icon name="menu" size={24} />
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Navigation" size="sm">
        <div className="-mx-4 flex flex-col">
          <NavList collapsed={false} onNavigate={() => setOpen(false)} />
        </div>
      </Sheet>

      <aside
        className={cn(
          'fixed bottom-0 left-0 top-0 z-nav hidden border-r border-line bg-bg-subtle transition-[width] duration-[var(--motion-default)] lg:flex lg:flex-col',
          collapsed ? 'w-[72px]' : 'w-[240px]',
        )}
        aria-label="Main navigation"
      >
        <div
          className={cn(
            'flex h-[56px] shrink-0 items-center border-b border-line px-4',
            collapsed ? 'justify-center px-0' : 'justify-between',
          )}
        >
          {!collapsed && <Logo />}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="inline-flex size-8 items-center justify-center rounded-xs text-fg-subtle hover:bg-overlay hover:text-fg"
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={18} />
          </button>
        </div>
        <NavList collapsed={collapsed} />
      </aside>
    </>
  );
}
