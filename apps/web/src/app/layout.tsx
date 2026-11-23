import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Unbounded } from 'next/font/google';
import { Shell } from '@/components/shell';
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

export const metadata: Metadata = {
  title: 'RAISE — Free 1v1 Gaming Challenges',
  description:
    'Free 1v1 challenges for eFootball, Call of Duty: Mobile and PUBG Mobile. Create, play and settle results with verified proof.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RAISE',
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
      </head>
      <body className="flex min-h-full flex-col bg-bg text-fg">
        <ErrorReporting />
        <ToastProvider>
          <Shell>{children}</Shell>
        </ToastProvider>
      </body>
    </html>
  );
}
