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
    <header className="sticky top-0 z-nav flex h-[56px] items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur lg:pl-[256px] lg:pr-8">
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
          fallback={<header className="sticky top-0 z-nav h-[56px] border-b border-line bg-bg" />}
        >
          <Header />
        </Suspense>

        <main className="flex-1 px-4 pb-[88px] pt-6 lg:pb-16 lg:pl-[288px] lg:pr-12 lg:pt-10">
          {children}
        </main>

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
