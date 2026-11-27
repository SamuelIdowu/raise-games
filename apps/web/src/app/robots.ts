import { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://raise.ng';

/**
 * Crawlers get the public pages (see sitemap.ts) and nothing behind sign-in. Rules are path
 * prefixes, so `/profile` also covers `/profile/<id>`; bracketed route patterns such as
 * `/profile/[userId]` never match a real URL. The app and onboarding layouts also send
 * `noindex`, which keeps a linked page out of results even though crawling is disallowed.
 */
const PRIVATE_PREFIXES = [
  '/api/',
  '/admin',
  '/onboarding',
  '/home',
  '/play',
  '/matches',
  '/leaderboard',
  '/profile',
  '/messages',
  '/inbox',
  '/settings',
  '/feedback',
  '/design',
  '/font-proof',
  '/verify-email',
  '/status',
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...PRIVATE_PREFIXES] },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
