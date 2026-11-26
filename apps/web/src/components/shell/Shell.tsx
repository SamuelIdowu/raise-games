import { type ReactNode, Suspense } from 'react';
import { Banner } from '@/components/ui';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { BottomNav } from './BottomNav';
import { NeedsActionBanner } from './NeedsActionBanner';
import { GameProvider } from './GameProvider';
import { PublicHeader } from './PublicHeader';
import { SiteFooter } from './SiteFooter';
import { AppFooter, AppTopBar } from './AppTopBar';
import { AuthGate } from './AuthGate';
import { Sidebar } from './Sidebar';
import { AppFrame } from './AppFrame';

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
 * Signed-in dashboard layout (route group `(app)`): collapsible 216/64px sidebar on desktop, a
 * sticky top bar, the needs-action banner, page content up to 1280px, and a one-line
 * footer. Below lg the sidebar folds into the top bar's menu and the bottom nav.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <GameProvider>
      <AuthGate />
      <AppFrame>
        {/* usePathname() in the navs needs Suspense under Cache Components. */}
        <Suspense
          fallback={
            <aside className="fixed inset-y-0 left-0 hidden w-[var(--sidebar-w)] border-r border-line bg-bg-subtle lg:block" />
          }
        >
          <Sidebar />
        </Suspense>

        <div className="flex min-h-screen min-w-0 flex-col transition-[padding] duration-[var(--motion-default)] ease-standard lg:pl-[var(--sidebar-w)]">
          {FEATURE_FLAGS.playCredits && (
            <Banner variant="system" className="mx-auto max-w-[480px] animate-in">
              Play credits, not cash. No deposit or withdrawal actions available in Stage 1.
            </Banner>
          )}
          <Suspense
            fallback={<header className="sticky top-0 z-nav h-14 border-b border-line bg-bg" />}
          >
            <AppTopBar />
          </Suspense>
          <Suspense fallback={null}>
            <NeedsActionBanner />
          </Suspense>

          <main className="w-full min-w-0 max-w-[1400px] flex-1 px-4 pt-5 lg:px-5 lg:pt-6">
            {children}
          </main>

          <AppFooter />
        </div>

        <Suspense
          fallback={
            <nav className="fixed bottom-0 left-0 right-0 z-40 h-[56px] border-t border-line bg-bg-subtle lg:hidden" />
          }
        >
          <BottomNav />
        </Suspense>
      </AppFrame>
    </GameProvider>
  );
}
