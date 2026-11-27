import { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://raise.ng';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/_next/',
        '/onboarding/',
        '/admin/',
        '/profile/[userId]',
        '/matches/[id]',
        '/messages/[id]',
        '/admin/disputes/[id]',
        '/admin/users/[id]',
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
