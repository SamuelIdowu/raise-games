import { Suspense } from 'react';
import { ProfileClient } from './profile-client';

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl p-6 text-body-sm text-fg-muted">Loading profile…</div>
      }
    >
      <ProfileClient />
    </Suspense>
  );
}
