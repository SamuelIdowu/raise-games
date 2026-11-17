import { Suspense } from 'react';
import { SkeletonCard } from '@/components/ui';
import { UserDetailClient } from './user-client';

export default function AdminUserPage() {
  return (
    <Suspense fallback={<SkeletonCard />}>
      <UserDetailClient />
    </Suspense>
  );
}
