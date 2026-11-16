'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui';
import { useBadges } from '@/lib/badges';

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

export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
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
      className="absolute -right-2 -top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-on-accent tabular"
      aria-label={`${count} ${label}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const badges = useNavBadges();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 h-[56px] border-t border-line bg-raised safe-area-inset-bottom lg:hidden"
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
                  active ? 'text-accent' : 'text-fg-muted'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <span className="relative">
                  <Icon name={item.icon} size={24} />
                  <NavBadge
                    count={badges[item.href] ?? 0}
                    label={item.href === '/inbox' ? 'unread' : 'need your action'}
                  />
                </span>
                <span className="label-caps text-[12px]">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
