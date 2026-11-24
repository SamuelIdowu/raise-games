'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Banner, ButtonLink, StatusChip } from '@/components/ui';

const GAMES = ['eFootball', 'Call of Duty: Mobile', 'PUBG Mobile'];

export default function LandingPage() {
  const pathname = usePathname();
  const router = useRouter();

  // Client-side redirect for signed-in users
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isSignedIn = document.cookie.includes('raise_access=');
      if (isSignedIn && pathname === '/') {
        router.push('/home');
        router.refresh();
      }
    }
  }, [pathname, router]);

  // Marquee animation state
  const [marqueeOffset, setMarqueeOffset] = useState(0);
  const marqueeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = marqueeRef.current;
    if (!element) return;

    const contentWidth = element.scrollWidth;
    const containerWidth = element.parentElement?.clientWidth ?? 0;
    if (contentWidth <= containerWidth) return;

    const duration = contentWidth * 20; // ~20ms per px
    let start: number | null = null;
    let animationId: number;

    function animate(timestamp: number) {
      if (start === null) start = timestamp;
      const progress = (timestamp - start) % duration;
      const offset = -(progress / duration) * contentWidth;
      element!.style.transform = `translateX(${offset}px)`;
      animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 p-4 md:p-8">
      {/* Hero */}
      <header className="text-center pt-4 md:pt-12">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent bg-accent-subtle px-3 py-1 text-caption font-semibold text-accent">
          <span className="size-2 rounded-full bg-accent animate-pulse" aria-hidden="true" />
          Free 1v1 challenges — no entry fees
        </span>
        <h1 className="mt-6 font-display text-display font-bold uppercase tracking-tight text-fg md:text-[48px]">
          Your game.
          <br />
          <span className="text-accent">Your stake.</span>
          <br />
          Verified results.
        </h1>
        <p className="mt-4 text-body text-fg-muted max-w-xl mx-auto">
          Challenge real players in eFootball, Call of Duty: Mobile or PUBG Mobile. Post a match,
          play, submit proof &mdash; we verify and update your rating instantly.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <ButtonLink
            href="/onboarding/phone"
            size="lg"
            fullWidth
            className="sm:w-auto min-w-[200px]"
            arrow
          >
            Start playing free
          </ButtonLink>
          <ButtonLink
            href="/play"
            variant="secondary"
            size="lg"
            fullWidth
            className="sm:w-auto min-w-[200px]"
          >
            Browse open challenges
          </ButtonLink>
        </div>

        <p className="mt-4 text-caption text-fg-subtle">
          No wallet. No crypto. Just verified 1v1 gaming.
        </p>
      </header>

      {/* Supported games ticker */}
      <section
        aria-label="Supported games"
        className="overflow-hidden bg-accent-subtle border-y border-accent py-3"
      >
        <div
          ref={marqueeRef}
          className="flex items-center gap-8 whitespace-nowrap animate-marquee"
          style={{ willChange: 'transform' }}
        >
          {GAMES.flatMap((game, i) => [
            <span
              key={`${game}-${i}`}
              className="font-display text-h3 font-black uppercase text-accent shrink-0"
            >
              {game}
            </span>,
            i < GAMES.length - 1 && (
              <span key={`sep-${i}`} className="text-fg-muted shrink-0">
                ·
              </span>
            ),
          ])}
          {GAMES.flatMap((game, i) => [
            <span
              key={`${game}-repeat-${i}`}
              className="font-display text-h3 font-black uppercase text-accent shrink-0"
            >
              {game}
            </span>,
            i < GAMES.length - 1 && (
              <span key={`sep-repeat-${i}`} className="text-fg-muted shrink-0">
                ·
              </span>
            ),
          ])}
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-heading">
        <h2 id="how-heading" className="sr-only">
          How it works
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <article className="surface-card rounded-card p-5 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-control bg-accent-subtle text-accent">
              <svg
                className="size-7"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h3 className="mt-4 font-display text-h2 font-black uppercase text-fg">
              Post a challenge
            </h3>
            <p className="mt-2 text-body-sm text-fg-muted">
              Pick your game, set the stake (NGN) and format. Your challenge appears in the lobby
              instantly.
            </p>
          </article>
          <article className="surface-card rounded-card p-5 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-control bg-accent-subtle text-accent">
              <svg
                className="size-7"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8" />
                <path d="M12 17v4" />
              </svg>
            </div>
            <h3 className="mt-4 font-display text-h2 font-black uppercase text-fg">
              Play & submit proof
            </h3>
            <p className="mt-2 text-body-sm text-fg-muted">
              Join the match, play to win. Upload a screenshot or video &mdash; we verify it
              automatically.
            </p>
          </article>
          <article className="surface-card rounded-card p-5 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-control bg-accent-subtle text-accent">
              <svg
                className="size-7"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3 className="mt-4 font-display text-h2 font-black uppercase text-fg">
              Result confirmed
            </h3>
            <p className="mt-2 text-body-sm text-fg-muted">
              Once verified, ratings update instantly. Build your reputation and climb the
              leaderboard.
            </p>
          </article>
        </div>
      </section>

      {/* Trust signals */}
      <section aria-labelledby="trust-heading" className="py-4 border-t border-line">
        <h2 id="trust-heading" className="sr-only">
          Why players trust RAISE
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="surface-card rounded-card p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-control bg-success/15 text-success">
                <svg
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
              <h4 className="font-display text-h3 font-black uppercase text-fg">Verified proof</h4>
            </div>
            <p className="mt-1 text-body-sm text-fg-muted">
              Screenshots & videos auto-checked. No fake results, no disputes over evidence.
            </p>
          </div>
          <div className="surface-card rounded-card p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-control bg-accent-subtle text-accent">
                <svg
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </span>
              <h4 className="font-display text-h3 font-black uppercase text-fg">
                Instant settlement
              </h4>
            </div>
            <p className="mt-1 text-body-sm text-fg-muted">
              Ratings update the moment a result is confirmed. No waiting, no manual review.
            </p>
          </div>
          <div className="surface-card rounded-card p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-control bg-brand/15 text-brand">
                <svg
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <h4 className="font-display text-h3 font-black uppercase text-fg">
                Reputation system
              </h4>
            </div>
            <p className="mt-1 text-body-sm text-fg-muted">
              Every confirmed match builds your profile. Reliable players get priority matching.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="text-center py-4">
        <h2 className="font-display text-mk-h1 uppercase text-fg text-balance">Ready to play?</h2>
        <p className="mt-2 text-body-sm text-fg-muted">
          Join thousands of players in free, verified 1v1 challenges.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <ButtonLink href="/onboarding/phone" size="lg" className="min-w-[200px]" arrow>
            Create free account
          </ButtonLink>
        </div>
      </section>

      {/* Footer */}
      <footer className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-line text-caption text-fg-subtle">
        <p>RAISE — Free 1v1 gaming challenges</p>
        <nav className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/community-rules" className="hover:text-fg transition-colors">
            Community rules
          </Link>
          <Link href="/privacy" className="hover:text-fg transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-fg transition-colors">
            Terms
          </Link>
          <Link href="/status" className="hover:text-fg transition-colors">
            Status
          </Link>
        </nav>
      </footer>
    </main>
  );
}
