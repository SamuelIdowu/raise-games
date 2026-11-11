import type { Metadata, Viewport } from 'next';
import { Chakra_Petch } from 'next/font/google';
import { Shell } from '@/components/shell';
import { ToastProvider } from '@/components/ui';
import { themeInitScript } from '@/lib/theme';
import './globals.css';

const chakraPetchDisplay = Chakra_Petch({
  variable: '--font-chakra',
  subsets: ['latin', 'latin-ext'],
  weight: '700',
  display: 'swap',
  preload: true,
});

const chakraPetchBody = Chakra_Petch({
  variable: '--font-chakra-body',
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600'],
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: 'RAISE — Competitive Gaming Challenges',
  description: 'Verified 1v1 challenges, real stakes, instant settlement. Built for Nigeria.',
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
  themeColor: '#0A0C10',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${chakraPetchDisplay.variable} ${chakraPetchBody.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-fg">
        <ToastProvider>
          <Shell>{children}</Shell>
        </ToastProvider>
      </body>
    </html>
  );
}
