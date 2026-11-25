'use client';

import { type ReactNode, Suspense } from 'react';
import { Banner } from '@/components/ui';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { BottomNav } from './BottomNav';
import { NeedsActionBanner } from './NeedsActionBanner';
import { GameProvider } from './GameProvider';
import { SiteFooter } from './SiteFooter';
import { TopNav } from './TopNav';

/**
 * Blocks.fun layout: 72px top nav (bottom nav on mobile), one centred column
 * per page, checker band + footer at the end.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <GameProvider>
      <div id="top" className="relative flex min-h-screen flex-col bg-bg text-fg">
        {FEATURE_FLAGS.playCredits && (
          <Banner variant="system" className="mx-auto max-w-[480px] animate-in">
            Play credits, not cash. No deposit or withdrawal actions available in Stage 1.
          </Banner>
        )}
        {/* usePathname() in the navs needs Suspense under Cache Components. */}
        <Suspense fallback={null}>
          <NeedsActionBanner />
        </Suspense>

        <Suspense
          fallback={
            <header className="sticky top-0 z-nav h-14 border-b border-line bg-bg lg:h-[72px]" />
          }
        >
          <TopNav />
        </Suspense>

        <main className="w-full flex-1 px-4 pt-8 lg:px-12 lg:pt-16">{children}</main>

        <SiteFooter />

        <Suspense
          fallback={
            <nav className="fixed bottom-0 left-0 right-0 z-40 h-[56px] border-t border-line bg-bg-subtle lg:hidden" />
          }
        >
          <BottomNav />
        </Suspense>
      </div>
    </GameProvider>
  );
}
