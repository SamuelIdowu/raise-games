'use client';

import { type ReactNode, Suspense } from 'react';
import { Banner } from '@/components/ui';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { GameSwitcher, GameSwitcherTrigger } from './GameSwitcher';
import { NeedsActionBanner } from './NeedsActionBanner';
import { GameProvider } from './GameProvider';

function Header() {
  return (
    <header className="sticky top-0 z-nav h-[56px] bg-raised border-b border-line flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <Sidebar />
        <GameSwitcherTrigger />
      </div>
      <div className="flex items-center gap-2">
        <GameSwitcher size="sm" />
      </div>
    </header>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <GameProvider>
      <div className="relative min-h-screen flex flex-col bg-bg text-fg">
        {FEATURE_FLAGS.playCredits && (
          <Banner variant="system" className="mx-auto max-w-[480px] animate-in">
            Play credits, not cash. No deposit or withdrawal actions available in Stage 1.
          </Banner>
        )}
        {/* usePathname() in Sidebar/BottomNav needs Suspense under Cache Components. */}
        <Suspense fallback={null}>
          <NeedsActionBanner />
        </Suspense>

        <Suspense
          fallback={
            <header className="sticky top-0 z-nav h-[56px] bg-raised border-b border-line" />
          }
        >
          <Header />
        </Suspense>

        <main className="flex-1 pb-[70px] pt-2 px-4 lg:pl-[248px] lg:pr-8">{children}</main>

        <Suspense
          fallback={
            <nav className="fixed bottom-0 left-0 right-0 z-40 h-[56px] border-t border-line bg-raised lg:hidden" />
          }
        >
          <BottomNav />
        </Suspense>
      </div>
    </GameProvider>
  );
}
