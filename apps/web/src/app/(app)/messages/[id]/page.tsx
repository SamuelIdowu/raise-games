import { Suspense } from 'react';
import { SkeletonCard } from '@/components/ui';
import { ConversationClient } from './conversation-client';

/** A direct-message conversation (Sprint 14, F14.3). 404s while DMs are off. */
export default function ConversationPage() {
  return (
    <Suspense fallback={<SkeletonCard />}>
      <ConversationClient />
    </Suspense>
  );
}
