import { PublicShell } from '@/components/shell';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell minimal>{children}</PublicShell>;
}
