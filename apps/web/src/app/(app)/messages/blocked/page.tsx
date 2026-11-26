'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { chatApi } from '@raise/api-client';
import { Banner, Button, EmptyState, SkeletonCard, useToast } from '@/components/ui';
import { useDmEnabled } from '@/features/dm/dm-kit';
import { formatClock } from '@/lib/time';

type Row = { userId: string; name: string; blockedAt: string };

/**
 * Blocked players (Sprint 14, F14.4): the "blocked by mistake" path. Only the caller's own
 * list is ever shown; nobody can see who blocked them. 404s while DMs are off.
 */
export default function BlockedPage() {
  const { enabled } = useDmEnabled();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    chatApi
      .blocks()
      .then((r) => setRows(r.items))
      .catch((e: Error) => setError(e.message));
  }, [enabled]);

  if (enabled === false) notFound();

  const unblock = async (r: Row) => {
    setBusy(r.userId);
    try {
      await chatApi.unblock(r.userId);
      setRows((prev) => prev?.filter((x) => x.userId !== r.userId) ?? prev);
      toast({ title: `${r.name} unblocked`, variant: 'status' });
    } catch (e) {
      toast({ title: 'Could not unblock', description: (e as Error).message, variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex max-w-[880px] flex-col gap-4">
      <h1 className="font-display text-mk-h1 uppercase text-fg text-balance">Blocked players</h1>
      <p className="text-body-sm text-fg-muted">
        Blocked players cannot message you or send you friend requests, and are not told. Blocked
        someone by mistake? Unblock them here. Unblocking does not bring back a friendship: send a
        new friend request from their profile if you want one.
      </p>
      {error ? <Banner variant="offline">Could not load your block list. {error}</Banner> : null}
      {!rows && !error ? <SkeletonCard /> : null}
      {rows && rows.length === 0 ? (
        <EmptyState
          pixel="shield"
          tone="brand"
          eyebrow="All clear"
          title="Nobody blocked"
          description="Blocked players can't challenge or message you. Block someone from their profile or a chat if you need to."
        />
      ) : null}
      {rows && rows.length > 0 ? (
        <ul className="divide-y divide-line surface-card rounded-card">
          {rows.map((r) => (
            <li key={r.userId} className="flex min-h-11 items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <Link
                  href={`/profile/${r.userId}`}
                  className="block truncate text-body-sm font-semibold text-fg hover:underline"
                >
                  {r.name}
                </Link>
                <span className="text-caption text-fg-subtle">
                  Blocked <time dateTime={r.blockedAt}>{formatClock(r.blockedAt)}</time>
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === r.userId}
                onClick={() => void unblock(r)}
              >
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
