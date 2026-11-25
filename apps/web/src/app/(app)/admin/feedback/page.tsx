'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { betaApi, type FeedbackItem, type FeedbackStatus, type Severity } from '@raise/api-client';
import {
  Button,
  EmptyState,
  SkeletonCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from '@/components/ui';
import { AdminHeader, LoadState, fmt, useAdminData } from '@/features/admin/admin-kit';

const SEVERITY_HELP: Record<Severity, string> = {
  S1: 'Wrong results, ratings or sanctions; data loss or exposure; a whole flow broken for many players; security.',
  S2: 'A flow broken for some players, no workaround.',
  S3: 'Broken with a workaround, or cosmetic in a key flow.',
  S4: 'Polish or an idea.',
};

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: 'New',
  triaged: 'Triaged',
  fixed: 'Fixed',
  wont_fix: 'Won’t fix',
  duplicate: 'Duplicate',
};

function Row({ item, onDone }: { item: FeedbackItem; onDone: () => void }) {
  const { toast } = useToast();
  const [severity, setSeverity] = useState<Severity | ''>(item.severity ?? '');
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [note, setNote] = useState(item.note ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await betaApi.triage(item.id, {
        severity: severity || undefined,
        status,
        note,
      });
      toast({ title: 'Saved' });
      onDone();
    } catch (e) {
      toast({ title: 'Could not save', description: (e as Error).message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <TableRow>
      <TableCell className="max-w-[28rem]">
        <span className="label-caps text-fg-muted">{item.kind}</span>
        <p className="whitespace-pre-wrap break-words text-body-sm text-fg">{item.body}</p>
        <span className="text-caption text-fg-subtle">
          {item.page ?? 'unknown page'}
          {item.appVersion ? ` · v${item.appVersion}` : ''}
        </span>
      </TableCell>
      <TableCell>
        {item.userId ? (
          <Link className="text-accent hover:underline" href={`/admin/users/${item.userId}`}>
            {item.reporter ?? 'Player'}
          </Link>
        ) : (
          '—'
        )}
        <span className="block text-caption text-fg-subtle">{fmt(item.createdAt)}</span>
      </TableCell>
      <TableCell>
        <select
          aria-label="Severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as Severity | '')}
          title={severity ? SEVERITY_HELP[severity] : undefined}
          className="h-9 rounded-control border border-line-strong bg-surface px-2 text-body-sm text-fg"
        >
          <option value="">Not set</option>
          {(Object.keys(SEVERITY_HELP) as Severity[]).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
          className="h-9 rounded-control border border-line-strong bg-surface px-2 text-body-sm text-fg"
        >
          {(Object.keys(STATUS_LABEL) as FeedbackStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <input
          aria-label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-9 w-full min-w-[10rem] surface-card rounded-card px-2 text-body-sm text-fg"
        />
      </TableCell>
      <TableCell>
        <Button size="sm" loading={busy} onClick={() => void save()}>
          Save
        </Button>
      </TableCell>
    </TableRow>
  );
}

function FeedbackQueue() {
  const params = useSearchParams();
  const [status, setStatus] = useState<FeedbackStatus | 'open'>('open');
  const severity = (params.get('severity') as Severity | null) ?? undefined;
  const { data, error, reload } = useAdminData(
    () => betaApi.feedback({ status, severity }),
    [status, severity],
  );
  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title={severity ? `Feedback · ${severity}` : 'Feedback'}>
        <select
          aria-label="Status filter"
          value={status}
          onChange={(e) => setStatus(e.target.value as FeedbackStatus | 'open')}
          className="h-11 rounded-control border border-line-strong bg-surface px-3 text-body text-fg"
        >
          <option value="open">Open (new and triaged)</option>
          {(Object.keys(STATUS_LABEL) as FeedbackStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </AdminHeader>
      {data ? (
        <p className="text-body-sm text-fg-muted">
          Open: S1 <strong className="tabular">{data.openBySeverity.S1}</strong> · S2{' '}
          <span className="tabular">{data.openBySeverity.S2}</span> · S3{' '}
          <span className="tabular">{data.openBySeverity.S3}</span> · S4{' '}
          <span className="tabular">{data.openBySeverity.S4}</span> · untriaged{' '}
          <span className="tabular">{data.openBySeverity.untriaged}</span>. The beta exit needs no
          open S1. S1: {SEVERITY_HELP.S1}
        </p>
      ) : null}
      <LoadState error={error} loading={!data && !error} onRetry={reload} />
      {data && data.items.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title="Nothing here"
          description="No feedback matches this filter."
        />
      ) : null}
      {data && data.items.length > 0 ? (
        <Table aria-label="Feedback">
          <TableHead>
            <TableHeaderCell>Report</TableHeaderCell>
            <TableHeaderCell>From</TableHeaderCell>
            <TableHeaderCell>Severity</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Note</TableHeaderCell>
            <TableHeaderCell>
              <span className="sr-only">Save</span>
            </TableHeaderCell>
          </TableHead>
          <TableBody>
            {data.items.map((item) => (
              <Row key={`${item.id}:${item.updatedAt}`} item={item} onDone={reload} />
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}

/** Feedback triage (Sprint 16, F16.3). Every change is audited. */
export default function FeedbackAdminPage() {
  return (
    <Suspense fallback={<SkeletonCard />}>
      <FeedbackQueue />
    </Suspense>
  );
}
