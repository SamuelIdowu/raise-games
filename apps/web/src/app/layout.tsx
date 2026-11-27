import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Unbounded } from 'next/font/google';
import { ToastProvider } from '@/components/ui';
import { ErrorReporting } from '@/components/error-reporting';
import { theme } from '@/lib/tokens.generated';
import { themeInitScript } from '@/lib/theme';
import './globals.css';

const unbounded = Unbounded({
  variable: '--font-unbounded',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: true,
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  preload: true,
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://raise.ng';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'RAISE — Free 1v1 Gaming Challenges',
    template: '%s | RAISE',
  },
  description:
    'Free 1v1 challenges for eFootball, Call of Duty: Mobile and PUBG Mobile. Create, play and settle results with verified proof.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RAISE',
  },
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    url: siteUrl,
    siteName: 'RAISE',
    title: 'RAISE — Free 1v1 Gaming Challenges',
    description:
      'Free 1v1 challenges for eFootball, Call of Duty: Mobile and PUBG Mobile. Create, play and settle results with verified proof.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RAISE — Free 1v1 Gaming Challenges',
    description:
      'Free 1v1 challenges for eFootball, Call of Duty: Mobile and PUBG Mobile. Create, play and settle results with verified proof.',
    creator: '@raise_games',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: theme.light.bg0 },
    { media: '(prefers-color-scheme: dark)', color: theme.dark.bg0 },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${unbounded.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="icon" href="/icons/icon-192.svg" type="image/svg+xml" sizes="any" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-fg">
        <ErrorReporting />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
