'use client';

import { useState } from 'react';
import Link from 'next/link';
import { adminApi, type ReportItem } from '@raise/api-client';
import {
  Button,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from '@/components/ui';
import { AdminHeader, LoadState, fmt, useAdminData, useStepUp } from '@/features/admin/admin-kit';
import { cn } from '@/lib/cn';

const key = (r: ReportItem) => `${r.kind}:${r.id}`;

/** Report triage (F12.4): match-chat and challenge/player reports in one queue. */
export default function ReportsPage() {
  const { toast } = useToast();
  const withStepUp = useStepUp();
  const [status, setStatus] = useState<'open' | 'dismissed' | 'actioned'>('open');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [sanction, setSanction] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data, error, reload } = useAdminData(() => adminApi.reports(status, 100), [status]);
  const rows = data?.items ?? [];
  const chosen = rows.filter((r) => picked.has(key(r)));
  const subjects = [...new Set(chosen.map((r) => r.subject_user_id).filter(Boolean))];

  const resolve = async (resolution: 'dismissed' | 'actioned') => {
    setBusy(true);
    try {
      const res = await withStepUp(() =>
        adminApi.resolveReports({
          items: chosen.map((r) => ({ kind: r.kind, id: r.id })),
          resolution,
          note: note.trim(),
          sanctionUserId:
            resolution === 'actioned' && sanction && subjects.length === 1 ? subjects[0] : null,
        }),
      );
      toast({ title: `${res.changed} report(s) ${resolution}` });
      setPicked(new Set());
      setNote('');
      setSanction(false);
      reload();
    } catch (e) {
      toast({
        title: 'Could not resolve',
        description: e instanceof Error ? e.message : undefined,
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="Reports">
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPicked(new Set());
          }}
          className="h-11 rounded-card border border-line bg-raised px-3 text-body text-fg"
        >
          <option value="open">Open</option>
          <option value="actioned">Actioned</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </AdminHeader>

      {picked.size > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-card border border-accent/40 bg-raised p-3"
        >
          <span className="text-body-sm text-fg">
            <span className="tabular">{picked.size}</span> selected
          </span>
          <input
            aria-label="Resolution note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (required)"
            className="h-8 min-w-[12rem] flex-1 rounded-card border border-line bg-surface px-2 text-body-sm text-fg"
          />
          <label
            className={cn(
              'inline-flex items-center gap-2 text-body-sm',
              subjects.length === 1 ? 'text-fg' : 'text-fg-subtle',
            )}
          >
            <input
              type="checkbox"
              checked={sanction}
              disabled={subjects.length !== 1}
              onChange={(e) => setSanction(e.target.checked)}
              className="size-4"
            />
            Sanction the reported player
          </label>
          <Button
            size="sm"
            variant="danger"
            loading={busy}
            disabled={note.trim().length < 3}
            onClick={() => void resolve('actioned')}
          >
            Action
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            disabled={note.trim().length < 3}
            onClick={() => void resolve('dismissed')}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      <LoadState error={error} loading={!data && !error} onRetry={reload} />
      {data && rows.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title="No reports here"
          description="Reports from chat, challenges and profiles land in this queue."
        />
      ) : null}
      {rows.length > 0 ? (
        <Table aria-label="Reports">
          <TableHead>
            <TableHeaderCell>
              <span className="sr-only">Select</span>
            </TableHeaderCell>
            <TableHeaderCell>Type</TableHeaderCell>
            <TableHeaderCell>Reason</TableHeaderCell>
            <TableHeaderCell>Content</TableHeaderCell>
            <TableHeaderCell>Reported player</TableHeaderCell>
            <TableHeaderCell>By</TableHeaderCell>
            <TableHeaderCell>When</TableHeaderCell>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={key(r)} selected={picked.has(key(r))}>
                <TableCell>
                  {status === 'open' ? (
                    <input
                      type="checkbox"
                      aria-label="Select report"
                      className="size-4"
                      checked={picked.has(key(r))}
                      onChange={() =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (n.has(key(r))) n.delete(key(r));
                          else n.add(key(r));
                          return n;
                        })
                      }
                    />
                  ) : null}
                </TableCell>
                <TableCell>{r.kind === 'message' ? 'Chat message' : r.subject_type}</TableCell>
                <TableCell>{r.reason.replace(/_/g, ' ')}</TableCell>
                <TableCell
                  className="max-w-[24rem] truncate"
                  title={r.body_snapshot ?? r.note ?? ''}
                >
                  {r.body_snapshot ? `“${r.body_snapshot}”` : (r.note ?? '—')}
                </TableCell>
                <TableCell>
                  {r.subject_user_id ? (
                    <Link
                      className="text-accent hover:underline"
                      href={`/admin/users/${r.subject_user_id}`}
                    >
                      Open record
                    </Link>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell>{r.reporter_name ?? '—'}</TableCell>
                <TableCell>{fmt(r.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
