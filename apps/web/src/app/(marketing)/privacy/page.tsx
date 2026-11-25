import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { PRIVACY_POLICY } from '@/content/legal';

export const metadata: Metadata = { title: 'Privacy policy · RAISE' };

export default function Page() {
  return <LegalPage doc={PRIVACY_POLICY} />;
}
