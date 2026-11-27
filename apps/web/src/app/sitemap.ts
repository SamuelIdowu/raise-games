import { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://raise.ng';

/**
 * Public pages only (pre-deploy audit 2026-11-27). Everything under the app and onboarding
 * needs a session, admin pages are staff-only, and dynamic pages such as `/profile/[userId]`
 * must never be listed with their placeholder.
 */
const PUBLIC_ROUTES = ['', '/community-rules', '/privacy', '/terms'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_ROUTES.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: path === '' ? ('weekly' as const) : ('monthly' as const),
    priority: path === '' ? 1.0 : 0.5,
  }));
}
