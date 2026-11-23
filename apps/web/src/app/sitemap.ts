import { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://raise.ng';

const staticRoutes = [
  '',
  '/home',
  '/play',
  '/matches',
  '/leaderboard',
  '/profile',
  '/settings',
  '/inbox',
  '/feedback',
  '/design',
  '/font-proof',
  '/community-rules',
  '/privacy',
  '/terms',
  '/verify-email',
  '/onboarding/phone',
  '/onboarding/otp',
  '/onboarding/username',
  '/onboarding/games',
  '/onboarding/game-ids',
  '/onboarding/consent',
  '/admin',
  '/admin/disputes',
  '/admin/matches',
  '/admin/reports',
  '/admin/signals',
  '/admin/users',
  '/admin/metrics',
  '/admin/beta',
  '/admin/feedback',
  '/admin/flags',
  '/admin/games',
  '/admin/audit',
];

const dynamicRoutes = [
  { path: '/profile/[userId]', changeFrequency: 'weekly' as const },
  { path: '/matches/[id]', changeFrequency: 'daily' as const },
  { path: '/messages/[id]', changeFrequency: 'weekly' as const },
  { path: '/admin/disputes/[id]', changeFrequency: 'daily' as const },
  { path: '/admin/users/[id]', changeFrequency: 'weekly' as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticEntries = staticRoutes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 1.0 : path === '/home' || path === '/play' ? 0.8 : 0.6,
  }));

  const dynamicEntries = dynamicRoutes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: 0.4,
  }));

  return [...staticEntries, ...dynamicEntries];
}
