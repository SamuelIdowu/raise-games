import type { ReactNode } from 'react';
import { AdminGate } from '@/features/admin/admin-kit';
import { AdminNav } from '@/features/admin/admin-nav';

/**
 * Trust & operations console (Sprint 12). Desktop-first and dense (Design §8 admin
 * tables), still usable at 360px. Every page sits behind the staff MFA gate.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
      <AdminNav />
      <AdminGate>{children}</AdminGate>
    </div>
  );
}
