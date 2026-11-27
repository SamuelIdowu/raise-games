'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { isAuthenticated } from '@raise/api-client';
import { ButtonLink } from '@/components/ui';
import { Logo } from './TopNav';

const LINKS = [
  { href: '/#how-heading', label: 'How it works' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/community-rules', label: 'Rules' },
  { href: '/#faq-heading', label: 'FAQ' },
] as const;

/**
 * Public site header (landing, legal, status, onboarding). No app navigation, no game
 * switcher: a visitor has no games yet. Signed-in players get a single "Open app" button.
 * `minimal` drops the links and CTAs for onboarding, where the only way out is forward.
 */
export function PublicHeader({ minimal = false }: { minimal?: boolean }) {
  // Tokens live in localStorage: unknown (null) on the server, read on the client.
  const signedIn = useSyncExternalStore<boolean | null>(
    () => () => {},
    () => isAuthenticated(),
    () => null,
  );

  return (
    <header className="sticky top-0 z-nav border-b border-line bg-bg">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-6 px-4 lg:h-[72px] lg:px-12">
        <Logo href="/" />

        {!minimal && (
          <>
            <span aria-hidden className="hidden h-full w-px bg-line lg:block" />
            <nav aria-label="Site" className="hidden items-center gap-8 lg:flex">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-fg-subtle transition-colors hover:text-fg"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-3">
              {signedIn ? (
                <ButtonLink href="/home" arrow>
                  Open app
                </ButtonLink>
              ) : (
                <>
                  <div className="hidden sm:block">
                    <ButtonLink href="/onboarding/phone" variant="secondary">
                      Sign in
                    </ButtonLink>
                  </div>
                  <ButtonLink href="/onboarding/phone" arrow>
                    Start playing
                  </ButtonLink>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
