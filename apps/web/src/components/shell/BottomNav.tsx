'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui';
import { useBadges } from '@/lib/badges';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/home', label: 'Home', icon: 'home' },
  { href: '/play', label: 'Play', icon: 'gamepad-2' },
  { href: '/matches', label: 'Matches', icon: 'trophy' },
  { href: '/inbox', label: 'Inbox', icon: 'mail' },
  { href: '/profile', label: 'Profile', icon: 'user' },
] as const;

export function isActive(pathname: string, href: string): boolean {
  if (href === '/home') return pathname === '/home' || pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Badge count per nav item (Design §8: Matches counts items needing action). */
export function useNavBadges(): Record<string, number> {
  const { unread, needsAction } = useBadges();
  return { '/inbox': unread, '/matches': needsAction.length };
}

export function NavBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      className="absolute -right-2 -top-1 min-w-4 rounded-sm bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-on-accent tabular"
      aria-label={`${count} ${label}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * `usePathname()` is runtime data under Cache Components, so it lives behind a Suspense
 * boundary; the fallback is the same nav with no active item (no layout shift).
 */
export function BottomNav() {
  return (
    <Suspense fallback={<BottomNavView pathname="" />}>
      <BottomNavWithPath />
    </Suspense>
  );
}

function BottomNavWithPath() {
  return <BottomNavView pathname={usePathname()} />;
}

function BottomNavView({ pathname }: { pathname: string }) {
  const badges = useNavBadges();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 h-[56px] border-t border-line bg-bg-subtle safe-area-inset-bottom lg:hidden"
      aria-label="Main navigation"
    >
      <ul className="flex h-full w-full items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="relative">
              {active ? (
                <span
                  aria-hidden
                  className="absolute -top-[9px] left-1/2 h-0.5 w-6 -translate-x-1/2 bg-accent"
                />
              ) : null}
              <Link
                href={item.href}
                className={`flex min-h-11 flex-col items-center gap-1 px-2 py-1.5 transition-colors ${
                  active ? 'text-fg' : 'text-fg-subtle'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <span className={`relative ${active ? 'text-accent' : ''}`}>
                  <Icon name={item.icon} size={24} />
                  <NavBadge
                    count={badges[item.href] ?? 0}
                    label={item.href === '/inbox' ? 'unread' : 'need your action'}
                  />
                </span>
                <span className="font-display text-[9px] font-bold uppercase tracking-[0.08em]">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
