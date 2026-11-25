import { Suspense } from 'react';
import { SkeletonCard } from '@/components/ui';
import { MatchRoomClient } from './match-room-client';

/** Match room (Sprint 7, F7.2). useParams needs a Suspense boundary under Cache Components. */
export default function MatchRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4" aria-busy="true" aria-label="Loading match">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      }
    >
      <MatchRoomClient />
    </Suspense>
  );
}
