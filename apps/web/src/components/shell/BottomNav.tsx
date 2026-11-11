'use client';

import { useState } from 'react';
import { Icon, type IconName } from '@/components/ui';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/play', label: 'Play', icon: 'gamepad-2' },
  { href: '/matches', label: 'Matches', icon: 'trophy' },
  { href: '/inbox', label: 'Inbox', icon: 'mail' },
  { href: '/profile', label: 'Profile', icon: 'user' },
] as const;

export function BottomNav() {
  const [active, setActive] = useState('/');
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 h-[56px] bg-raised border-t border-line safe-area-inset-bottom"
      role="navigation"
      aria-label="Main navigation"
    >
      <ul className="flex h-full w-full items-center justify-around">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                setActive(item.href);
                window.location.href = item.href;
              }}
              className={`flex flex-col items-center gap-1 px-2 py-1.5 transition-colors ${
                active === item.href ? 'text-accent' : 'text-fg-muted'
              }`}
              aria-current={active === item.href ? 'page' : undefined}
            >
              <Icon name={item.icon} size={24} />
              <span className="label-caps text-[10px]">{item.label}</span>
              {active === item.href && (
                <span
                  className="absolute -top-1 left-1/2 -translate-x-1/2 size-1.5 rounded-full bg-accent"
                  aria-hidden
                />
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
