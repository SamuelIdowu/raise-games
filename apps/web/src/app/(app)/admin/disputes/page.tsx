'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminApi, type QueueItem, type QueueState } from '@raise/api-client';
import {
  Button,
  EmptyState,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from '@/components/ui';
import {
  AdminHeader,
  LoadState,
  Pager,
  SlaClock,
  fmt,
  useAdminData,
} from '@/features/admin/admin-kit';
import { cn } from '@/lib/cn';

const TABS: Array<{ key: QueueState | 'all'; label: string }> = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'assigned', label: 'In review' },
  { key: 'awaiting_info', label: 'Awaiting info' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

const STATE_CHIP: Record<
  QueueState,
  { label: string; variant: 'neutral' | 'accent' | 'dispute' | 'muted' }
> = {
  unassigned: { label: 'Unassigned', variant: 'dispute' },
  assigned: { label: 'In review', variant: 'accent' },
  awaiting_info: { label: 'Awaiting info', variant: 'neutral' },
  resolved: { label: 'Resolved', variant: 'muted' },
};

/** Dispute queue (Design §8: unassigned, assigned, awaiting info, resolved; SLA clock). */
export default function DisputeQueuePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<QueueState | 'all'>('unassigned');
  const [mine, setMine] = useState(false);
  const [extra, setExtra] = useState<QueueItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const { data, error, reload } = useAdminData(async () => {
    const page = await adminApi.queue({ state: tab === 'all' ? undefined : tab, mine, limit: 25 });
    setExtra([]);
    setCursor(page.nextCursor);
    return page;
  }, [tab, mine]);
  const rows = [...(data?.items ?? []), ...extra];

  const more = async () => {
    if (!cursor) return;
    const page = await adminApi.queue({
      state: tab === 'all' ? undefined : tab,
      mine,
      limit: 25,
      cursor,
    });
    setExtra((e) => [...e, ...page.items]);
    setCursor(page.nextCursor);
  };

  const claim = async (item: QueueItem) => {
    setBusyId(item.id);
    try {
      await adminApi.assign(item.id);
      router.push(`/admin/disputes/${item.id}`);
    } catch (e) {
      toast({
        title: 'Could not claim',
        description: e instanceof Error ? e.message : undefined,
        variant: 'error',
      });
      reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="Disputes">
        <label className="inline-flex min-h-11 items-center gap-2 text-body-sm text-fg">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => setMine(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Only mine
        </label>
      </AdminHeader>

      <div
        role="tablist"
        aria-label="Queue"
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'min-h-11 whitespace-nowrap border-b-2 px-3 font-display text-body-sm font-semibold',
              tab === t.key
                ? 'border-accent text-accent'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <LoadState error={error} loading={!data && !error} onRetry={reload} />
      {data && rows.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title="Queue is clear"
          description="No disputes in this view. New ones appear here as they open."
        />
      ) : null}
      {rows.length > 0 ? (
        <Table
          aria-label="Dispute queue"
          onKeyDown={(e) => {
            // Full keyboard navigation (Design §8 tables): arrows move, Enter opens.
            if (e.key === 'ArrowDown') setSelected((s) => Math.min(rows.length - 1, s + 1));
            if (e.key === 'ArrowUp') setSelected((s) => Math.max(0, s - 1));
            if (e.key === 'Enter' && rows[selected])
              router.push(`/admin/disputes/${rows[selected]!.id}`);
          }}
          tabIndex={0}
        >
          <TableHead>
            <TableHeaderCell>State</TableHeaderCell>
            <TableHeaderCell>Game</TableHeaderCell>
            <TableHeaderCell>Reason</TableHeaderCell>
            <TableHeaderCell>Opened</TableHeaderCell>
            <TableHeaderCell>SLA</TableHeaderCell>
            <TableHeaderCell>Moderator</TableHeaderCell>
            <TableHeaderCell>
              <span className="sr-only">Actions</span>
            </TableHeaderCell>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.id} selected={i === selected} onClick={() => setSelected(i)}>
                <TableCell>
                  <StatusChip
                    label={STATE_CHIP[r.state].label}
                    variant={STATE_CHIP[r.state].variant}
                  />
                </TableCell>
                <TableCell>{r.gameName}</TableCell>
                <TableCell>
                  {(r.category ?? r.reason).replace(/_/g, ' ')}
                  {r.source === 'auto_conflict' ? (
                    <span className="text-caption text-fg-muted"> · auto</span>
                  ) : null}
                </TableCell>
                <TableCell>{fmt(r.createdAt)}</TableCell>
                <TableCell>
                  {r.state === 'resolved' ? (
                    '—'
                  ) : (
                    <SlaClock dueAt={r.sla.dueAt} breached={r.sla.breached} />
                  )}
                </TableCell>
                <TableCell>{r.assignedName ?? '—'}</TableCell>
                <TableCell className="text-right">
                  {r.state === 'unassigned' ? (
                    <Button size="sm" loading={busyId === r.id} onClick={() => void claim(r)}>
                      Claim
                    </Button>
                  ) : (
                    <Link
                      href={`/admin/disputes/${r.id}`}
                      className="text-body-sm text-accent hover:underline"
                    >
                      Open
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <Pager hasMore={!!cursor} onMore={() => void more()} />
    </div>
  );
}
