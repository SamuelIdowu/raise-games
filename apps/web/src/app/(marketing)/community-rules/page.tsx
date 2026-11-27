import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { COMMUNITY_RULES } from '@/content/legal';

export const metadata: Metadata = { title: 'Community rules · RAISE' };

export default function Page() {
  return <LegalPage doc={COMMUNITY_RULES} />;
}
