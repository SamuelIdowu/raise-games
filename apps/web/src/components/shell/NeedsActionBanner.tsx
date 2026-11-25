'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Banner } from '@/components/ui';
import { useBadges } from '@/lib/badges';

/**
 * Needs-your-action banner (Design §7: always the accent). Real data since Sprint 11:
 * matches where the viewer must submit or confirm a result. Hidden inside the match room
 * it points to, and dismissible for the session.
 */
export function NeedsActionBanner() {
  const { needsAction } = useBadges();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = needsAction.filter(
    (item) => !dismissed.has(item.matchId) && pathname !== `/matches/${item.matchId}`,
  );
  if (visible.length === 0) return null;
  const first = visible[0]!;

  return (
    <div className="px-4 pt-2">
      <Banner
        variant="needs-action"
        className="mx-auto max-w-[880px]"
        action={
          <button
            type="button"
            onClick={() => setDismissed((prev) => new Set(prev).add(first.matchId))}
            className="min-h-11 px-3 text-caption text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Dismiss
          </button>
        }
      >
        <Link href={`/matches/${first.matchId}`} className="flex flex-col gap-0.5 hover:underline">
          <span className="font-display text-body-sm font-semibold text-fg">
            {first.action === 'confirm_or_submit'
              ? `Confirm the result against ${first.opponent}`
              : `Submit your result against ${first.opponent}`}
          </span>
          <span className="text-caption text-fg-muted">
            {first.game}
            {visible.length > 1 ? ` · ${visible.length - 1} more need you` : ''}
          </span>
        </Link>
      </Banner>
    </div>
  );
}
