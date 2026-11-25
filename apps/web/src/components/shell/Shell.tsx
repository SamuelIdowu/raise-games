import { type ReactNode, Suspense } from 'react';
import { Banner } from '@/components/ui';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { BottomNav } from './BottomNav';
import { NeedsActionBanner } from './NeedsActionBanner';
import { GameProvider } from './GameProvider';
import { PublicHeader } from './PublicHeader';
import { SiteFooter } from './SiteFooter';
import { TopNav } from './TopNav';

/**
 * Public layout: landing, legal, status (route group `(marketing)`) and onboarding
 * (`(onboarding)`, `minimal`). Site header and footer only; no app navigation, no game
 * switcher, no needs-action banner.
 */
export function PublicShell({
  children,
  minimal = false,
}: {
  children: ReactNode;
  minimal?: boolean;
}) {
  return (
    <div id="top" className="relative flex min-h-screen flex-col overflow-x-clip bg-bg text-fg">
      <PublicHeader minimal={minimal} />
      <main className="w-full flex-1 px-4 pt-8 lg:px-12 lg:pt-16">{children}</main>
      {!minimal && <SiteFooter publicSite />}
    </div>
  );
}

/**
 * Signed-in layout (route group `(app)`): 72px top nav (bottom nav on mobile), the
 * needs-action banner, and a 1280px content frame. Pages lay out a main column and a
 * rail inside it with `AppPage`.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <GameProvider>
      <div id="top" className="relative flex min-h-screen flex-col overflow-x-clip bg-bg text-fg">
        {FEATURE_FLAGS.playCredits && (
          <Banner variant="system" className="mx-auto max-w-[480px] animate-in">
            Play credits, not cash. No deposit or withdrawal actions available in Stage 1.
          </Banner>
        )}
        {/* usePathname() in the navs needs Suspense under Cache Components. */}
        <Suspense
          fallback={
            <header className="sticky top-0 z-nav h-14 border-b border-line bg-bg lg:h-[72px]" />
          }
        >
          <TopNav />
        </Suspense>
        <Suspense fallback={null}>
          <NeedsActionBanner />
        </Suspense>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 lg:px-12 lg:pt-10">
          {children}
        </main>

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
