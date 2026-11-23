'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, Icon, Sheet } from '@/components/ui';
import { NAV_ITEMS, NavBadge, useNavBadges, type NavItem } from './BottomNav';
import { signOut } from '@/lib/session';

export function Sidebar() {
  const pathname = usePathname();
  const badges = useNavBadges();
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
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item: NavItem) => {
            const active =
              item.href === '/home'
                ? pathname === '/home' || pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-card text-fg hover:bg-overlay transition-colors ${
                  active ? 'bg-accent-subtle text-accent' : ''
                }`}
                onClick={() => setOpen(false)}
              >
                <Icon name={item.icon as import('@/components/ui').IconName} size={24} />
                <span className="font-display text-body-sm">{item.label}</span>
              </Link>
            );
          })}
          <Link
            href="/settings"
            className="mt-2 flex items-center gap-3 border-t border-line px-3 py-2 pt-3 text-fg-muted hover:bg-overlay hover:text-fg"
          >
            <Icon name="settings" size={24} aria-hidden />
            <span className="font-display text-body-sm">Settings</span>
          </Link>
          <Link
            href="/feedback"
            className="flex items-center gap-3 px-3 py-2 text-fg-muted hover:bg-overlay hover:text-fg"
          >
            <Icon name="flag" size={24} aria-hidden />
            <span className="font-display text-body-sm">Send feedback</span>
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex min-h-11 items-center gap-3 px-3 py-2 text-left text-fg-muted hover:bg-overlay hover:text-fg"
          >
            <Icon name="log-out" size={24} aria-hidden />
            <span className="font-display text-body-sm">Sign out</span>
          </button>
        </nav>
      </Sheet>

      <aside
        className={`hidden lg:flex lg:flex-col fixed lg:left-0 top-0 bottom-[56px] z-nav bg-raised border-r border-line transition-all duration-[var(--motion-default)] ${
          collapsed ? 'w-[72px]' : 'w-[240px]'
        }`}
        aria-label="Main navigation"
      >
        <div className="flex h-[56px] items-center justify-between px-3 border-b border-line">
          {!collapsed && <span className="font-display text-h3 font-semibold text-fg">RAISE</span>}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={20} />
          </Button>
        </div>
        <nav className="flex-1 flex flex-col gap-1 p-2 overflow-y-auto">
          {NAV_ITEMS.map((item: NavItem) => {
            const active =
              item.href === '/home'
                ? pathname === '/home' || pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-card text-fg hover:bg-overlay transition-colors ${
                  collapsed ? 'justify-center' : ''
                } ${active ? 'bg-accent-subtle text-accent' : ''}`}
              >
                <span className="relative shrink-0">
                  <Icon name={item.icon as import('@/components/ui').IconName} size={24} />
                  <NavBadge
                    count={badges[item.href] ?? 0}
                    label={item.href === '/inbox' ? 'unread' : 'need your action'}
                  />
                </span>
                {!collapsed && (
                  <span className="font-display text-body-sm truncate">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/settings"
          aria-label={collapsed ? 'Settings' : undefined}
          className={`mx-2 mt-2 flex items-center gap-3 rounded-card border-t border-line px-3 py-2 text-fg-muted hover:bg-overlay hover:text-fg ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <Icon name="settings" size={20} aria-hidden />
          {!collapsed && <span className="font-display text-body-sm">Settings</span>}
        </Link>
        {/* Sprint 16: beta feedback, one tap from anywhere. */}
        <Link
          href="/feedback"
          aria-label={collapsed ? 'Send feedback' : undefined}
          className={`m-2 flex items-center gap-3 rounded-card border-t border-line px-3 py-2 text-fg-muted hover:bg-overlay hover:text-fg ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <Icon name="flag" size={20} aria-hidden />
          {!collapsed && <span className="font-display text-body-sm">Send feedback</span>}
        </Link>
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label={collapsed ? 'Sign out' : undefined}
          className={`mx-2 mb-2 flex min-h-11 items-center gap-3 rounded-card px-3 py-2 text-left text-fg-muted hover:bg-overlay hover:text-fg ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <Icon name="log-out" size={20} aria-hidden />
          {!collapsed && <span className="font-display text-body-sm">Sign out</span>}
        </button>
      </aside>
    </>
  );
}
