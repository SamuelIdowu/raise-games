'use client';

import { Banner } from '@/components/ui';
import { useState } from 'react';

interface NeedsActionItem {
  id: string;
  type: 'confirm' | 'expiring' | 'dispute';
  title: string;
  matchId: string;
  timeLeft?: number;
}

const MOCK_NEEDS_ACTION: NeedsActionItem[] = [
  { id: '1', type: 'confirm', title: 'Confirm result for RZ-1042', matchId: 'RZ-1042' },
  {
    id: '2',
    type: 'expiring',
    title: 'Challenge RZ-1045 expires in 15m',
    matchId: 'RZ-1045',
    timeLeft: 15 * 60,
  },
];

export function NeedsActionBanner() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleItems = MOCK_NEEDS_ACTION.filter((item) => !dismissed.has(item.id));

  if (visibleItems.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-4 pt-4 safe-area-inset-top">
      {visibleItems.map((item) => (
        <Banner
          key={item.id}
          variant="needs-action"
          className="mx-auto max-w-[480px] animate-in"
          action={
            <button
              type="button"
              onClick={() => setDismissed((prev) => new Set(prev).add(item.id))}
              className="text-caption text-accent hover:underline"
            >
              Dismiss
            </button>
          }
        >
          <div className="flex flex-col gap-1">
            <p className="font-display text-body-sm font-semibold text-fg">{item.title}</p>
            <p className="text-caption text-fg-muted">Match {item.matchId}</p>
          </div>
        </Banner>
      ))}
    </div>
  );
}
