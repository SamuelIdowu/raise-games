import { Suspense } from 'react';
import { SkeletonCard } from '@/components/ui';
import { DisputeViewerClient } from './viewer-client';

export default function DisputeViewerPage() {
  return (
    <Suspense fallback={<SkeletonCard />}>
      <DisputeViewerClient />
    </Suspense>
  );
}
