import type { Metadata } from 'next';
import { Shell } from '@/components/shell';

/** Signed-in pages are never search results (robots.ts also disallows them). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
