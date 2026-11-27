import type { Metadata } from 'next';
import { PublicShell } from '@/components/shell';

/** Sign-up steps are never search results (robots.ts also disallows them). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell minimal>{children}</PublicShell>;
}
