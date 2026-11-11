'use client';

import { useState } from 'react';
import { Button, Icon, Sheet } from '@/components/ui';
import { NAV_ITEMS, type NavItem } from './BottomNav';

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
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item: NavItem) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                window.location.href = item.href;
                setOpen(false);
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-card text-fg hover:bg-overlay"
            >
              <Icon name={item.icon as import('@/components/ui').IconName} size={24} />
              <span className="font-display text-body-sm">{item.label}</span>
            </a>
          ))}
        </nav>
      </Sheet>

      <aside
        className={`hidden lg:flex lg:flex-col fixed lg:left-0 top-0 bottom-14 z-30 bg-raised border-r border-line transition-all duration-[var(--motion-default)] ${
          collapsed ? 'w-[72px]' : 'w-[240px]'
        }`}
        aria-label="Main navigation"
      >
        <div className="flex h-14 items-center justify-between px-3 border-b border-line">
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
          {NAV_ITEMS.map((item: NavItem) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                window.location.href = item.href;
              }}
              className={`flex items-center gap-3 px-3 py-2 rounded-card text-fg hover:bg-overlay transition-colors ${
                collapsed ? 'justify-center' : ''
              }`}
            >
              <Icon
                name={item.icon as import('@/components/ui').IconName}
                size={24}
                className="shrink-0"
              />
              {!collapsed && (
                <span className="font-display text-body-sm truncate">{item.label}</span>
              )}
            </a>
          ))}
        </nav>
      </aside>
    </>
  );
}
