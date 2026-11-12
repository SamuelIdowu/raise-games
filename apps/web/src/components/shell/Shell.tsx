'use client';

import { type ReactNode, useState } from 'react';
import { Banner } from '@/components/ui';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { GameSwitcher, GameSwitcherTrigger } from './GameSwitcher';
import { NeedsActionBanner } from './NeedsActionBanner';

export function Shell({ children }: { children: ReactNode }) {
  const [currentGame, setCurrentGame] = useState('fifa25');

  return (
    <div className="relative min-h-screen flex flex-col bg-bg text-fg">
      {FEATURE_FLAGS.playCredits && (
        <Banner variant="system" className="mx-auto max-w-[480px] animate-in">
          Play credits, not cash. No deposit or withdrawal actions available in Stage 1.
        </Banner>
      )}
      <NeedsActionBanner />

      <header className="sticky top-0 z-30 h-14 bg-raised/80 backdrop-blur border-b border-line flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Sidebar />
          <GameSwitcherTrigger currentGame={currentGame} />
        </div>
        <div className="flex items-center gap-2">
          <GameSwitcher currentGame={currentGame} onChange={setCurrentGame} size="sm" />
        </div>
      </header>

      <main className="flex-1 pb-[70px] pt-2 px-4 lg:pl-[248px] lg:pr-8">{children}</main>

      <BottomNav />
    </div>
  );
}
