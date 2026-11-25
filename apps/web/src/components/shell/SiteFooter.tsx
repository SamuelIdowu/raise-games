import Link from 'next/link';
import { Logo } from './TopNav';

const LINKS = [
  { href: '/community-rules', label: 'Community rules' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/status', label: 'Status' },
  { href: '/feedback', label: 'Send feedback' },
] as const;

/**
 * Blocks.fun §4.5 + §7.14: pixel checker band, then a hairline footer with
 * logo + tagline, links, a legal row and a purple back-to-top block.
 */
export function SiteFooter({ publicSite = false }: { publicSite?: boolean }) {
  return (
    <footer className="mt-24">
      <div aria-hidden className="checker-band" />
      <div
        className={`border-t border-line px-4 pt-10 lg:px-12 lg:pb-10 ${publicSite ? 'pb-10' : 'pb-24'}`}
      >
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <Logo href={publicSite ? '/' : '/home'} />
            <p className="max-w-[260px] text-[11px] leading-relaxed text-fg">
              Free 1v1 challenges for eFootball, Call of Duty: Mobile and PUBG Mobile.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-display text-[10px] font-bold uppercase tracking-[0.08em] text-fg-subtle transition-colors hover:text-fg"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-2 text-[10px] leading-snug text-fg-disabled md:flex-row md:items-center md:justify-between">
          <p>Free to play. No deposits, no withdrawals. Play fair.</p>
          <p>© 2026 RAISE · All rights reserved</p>
        </div>
      </div>
      <a
        href="#top"
        aria-label="Back to top"
        className={`fixed right-4 ${publicSite ? 'bottom-4' : 'bottom-[72px]'} z-30 inline-flex size-9 items-center justify-center rounded-control bg-accent text-on-accent shadow-hard-sm transition-transform [--hard-ink:var(--accent-ink)] hover:-translate-y-0.5 lg:bottom-6 lg:right-6`}
      >
        <svg width="14" height="14" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden>
          <path fill="currentColor" d="M3 0h1v1H3zM2 1h3v1H2zM1 2h5v1H1zM3 3h1v4H3z" />
        </svg>
      </a>
    </footer>
  );
}
