import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { TERMS_OF_SERVICE } from '@/content/legal';

export const metadata: Metadata = { title: 'Terms of service · RAISE' };

export default function Page() {
  return <LegalPage doc={TERMS_OF_SERVICE} />;
}
