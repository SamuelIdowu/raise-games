'use client';

import Link from 'next/link';
import { adminApi } from '@raise/api-client';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui';
import { AdminHeader, LoadState, fmt, useAdminData } from '@/features/admin/admin-kit';

function Stat({
  label,
  value,
  href,
  alert,
}: {
  label: string;
  value: number | string;
  href?: string;
  alert?: boolean;
}) {
  const body = (
    <>
      <span className="label-caps text-fg-muted">{label}</span>
      <span
        className={`font-display text-stat-lg font-semibold tabular ${alert ? 'text-dispute' : 'text-fg'}`}
      >
        {value}
      </span>
    </>
  );
  const cls = 'flex flex-col gap-1 surface-card rounded-card p-4';
  return href ? (
    <Link href={href} className={`${cls} hover:border-line-strong`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default function AdminDashboard() {
  const { data, error, reload } = useAdminData(() => adminApi.dashboard(), []);
  const m = data?.metrics;
  return (
    <div className="flex flex-col gap-6">
      <AdminHeader title="Trust & operations" />
      <LoadState error={error} loading={!data && !error} onRetry={reload} />
      {data ? (
        <>
          <section aria-label="Dispute queue" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="Unassigned"
              value={data.queue.unassigned}
              href="/admin/disputes?state=unassigned"
            />
            <Stat
              label="In review"
              value={data.queue.assigned}
              href="/admin/disputes?state=assigned"
            />
            <Stat
              label="Awaiting info"
              value={data.queue.awaitingInfo}
              href="/admin/disputes?state=awaiting_info"
            />
            <Stat
              label="Past 24h SLA"
              value={data.queue.slaBreached}
              alert={data.queue.slaBreached > 0}
              href="/admin/disputes"
            />
          </section>
          <section aria-label="Signals" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Open reports" value={data.openReports} href="/admin/reports" />
            <Stat label="Hash flags (30d)" value={data.hashFlags30d} href="/admin/signals" />
            <Stat label="Chat flags" value={data.openChatFlags} />
            <Stat label="Active sanctions" value={data.activeSanctions} href="/admin/users" />
          </section>
          <section aria-label="Success metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="Disputes (30d)" value={m?.disputesOpened ?? 0} />
            <Stat
              label="Dispute rate"
              value={`${((m?.disputeRate ?? 0) * 100).toFixed(1)}%`}
              alert={(m?.disputeRate ?? 0) > 0.1}
            />
            <Stat
              label="Median resolution"
              value={
                m?.medianResolutionMs == null
                  ? '—'
                  : `${(m.medianResolutionMs / 3600_000).toFixed(1)}h`
              }
              alert={(m?.medianResolutionMs ?? 0) > 24 * 3600_000}
            />
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="font-display text-h2 font-black uppercase text-fg">
              Stuck matches <span className="text-fg-muted tabular">({data.stuckMatches})</span>
            </h2>
            {data.stuck.length === 0 ? (
              <p className="text-body-sm text-fg-muted">
                No stuck matches. Deadlines are being met.
              </p>
            ) : (
              <Table>
                <TableHead>
                  <TableHeaderCell>Match</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Deadline</TableHeaderCell>
                  <TableHeaderCell>Last change</TableHeaderCell>
                </TableHead>
                <TableBody>
                  {data.stuck.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-caption">{s.id.slice(0, 8)}</TableCell>
                      <TableCell>{s.status.replace(/_/g, ' ')}</TableCell>
                      <TableCell>{fmt(s.confirmationDeadline ?? s.resultDeadline)}</TableCell>
                      <TableCell>{fmt(s.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
