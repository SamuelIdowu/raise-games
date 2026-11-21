'use client';

import { useState } from 'react';
import Link from 'next/link';
import { betaApi, type BetaMetric, type BetaMetrics } from '@raise/api-client';
import {
  Button,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { AdminHeader, LoadState, useAdminData } from '@/features/admin/admin-kit';
import { cn } from '@/lib/cn';

function show(m: BetaMetric, v: number | null): string {
  if (v === null) return '—';
  if (m.unit === 'share') return `${(v * 100).toFixed(1)}%`;
  if (m.unit === 'hours') return `${v.toFixed(1)} h`;
  return v.toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

function target(m: BetaMetric): string {
  const t = show(m, m.target);
  if (m.kind === 'count') return `${t} by week 8`;
  return m.kind === 'min' ? `≥ ${t}` : `< ${t}`;
}

/** Text first, colour second (Design §10: never colour alone). */
function Marker({ status }: { status: BetaMetric['status'] }) {
  if (status === 'no_data') return <span className="text-fg-muted">No data yet</span>;
  const ok = status === 'on_track';
  return (
    <span className={cn('inline-flex items-center gap-1', ok ? 'text-win' : 'text-dispute')}>
      <Icon name={ok ? 'check-circle' : 'alert-triangle'} size={16} aria-hidden />
      {ok ? 'On track' : 'Behind'}
    </span>
  );
}

function toCsv(d: BetaMetrics): string {
  const lines = [
    ['metric', 'value', 'target', 'pace', 'status', 'cohort', 'since', 'until'].join(','),
    ...d.metrics.map((m) =>
      [
        m.key,
        m.value ?? '',
        m.target,
        m.pace ?? '',
        m.status,
        d.cohort ?? 'all',
        d.since,
        d.until,
      ].join(','),
    ),
    '',
    ['day', 'signups', 'challenges', 'completed'].join(','),
    ...d.series.map((s) => [s.day, s.signups, s.challenges, s.completed].join(',')),
  ];
  return lines.join('\n');
}

/**
 * Beta metrics (Sprint 16, F16.2): the PRD Stage 1 success metrics per cohort, the signup
 * funnel, daily activity and the open-severity gate (M4 exit: no open S1).
 */
export default function MetricsPage() {
  const [cohort, setCohort] = useState('');
  const { data, error, reload } = useAdminData(
    () => betaApi.metrics({ cohort: cohort || undefined }),
    [cohort],
  );

  const download = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([toCsv(data)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `raise-beta-metrics-${data.cohort ?? 'all'}-${data.until.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      <AdminHeader title="Beta metrics">
        <select
          aria-label="Cohort"
          value={cohort}
          onChange={(e) => setCohort(e.target.value)}
          className="h-11 rounded-card border border-line bg-raised px-3 text-body text-fg"
        >
          <option value="">All players</option>
          {data?.cohorts.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button variant="secondary" size="sm" disabled={!data} onClick={download}>
          Download CSV
        </Button>
      </AdminHeader>

      <LoadState error={error} loading={!data && !error} onRetry={reload} />

      {data ? (
        <>
          <p className="text-body-sm text-fg-muted">
            {data.days} days from {data.since.slice(0, 10)}. Count targets are the 8-week launch
            targets, judged against the pace for the weeks elapsed; the beta is smaller than launch,
            so watch the rates.
          </p>

          <section aria-labelledby="gate-heading" className="flex flex-col gap-2">
            <h2 id="gate-heading" className="label-caps text-fg-muted">
              Exit gate: open issues by severity
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {(['S1', 'S2', 'S3', 'S4', 'untriaged'] as const).map((k) => (
                <Link
                  key={k}
                  href={`/admin/feedback${k === 'untriaged' ? '' : `?severity=${k}`}`}
                  className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4 hover:border-line-strong"
                >
                  <span className="label-caps text-fg-muted">
                    {k === 'untriaged' ? 'Untriaged' : k}
                  </span>
                  <span
                    className={cn(
                      'font-display text-stat-lg font-semibold tabular',
                      k === 'S1' && data.feedback.S1 > 0 ? 'text-dispute' : 'text-fg',
                    )}
                  >
                    {data.feedback[k]}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <Table aria-label="PRD success metrics">
            <TableHead>
              <TableHeaderCell>Metric</TableHeaderCell>
              <TableHeaderCell>Now</TableHeaderCell>
              <TableHeaderCell>Target</TableHeaderCell>
              <TableHeaderCell>Pace today</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
            </TableHead>
            <TableBody>
              {data.metrics.map((m) => (
                <TableRow key={m.key}>
                  <TableCell>
                    <span className="block font-semibold text-fg">{m.label}</span>
                    <span className="block text-caption text-fg-muted">{m.prd}</span>
                  </TableCell>
                  <TableCell className="tabular">{show(m, m.value)}</TableCell>
                  <TableCell className="tabular">{target(m)}</TableCell>
                  <TableCell className="tabular">
                    {m.pace === null ? '—' : show(m, m.pace)}
                  </TableCell>
                  <TableCell>
                    <Marker status={m.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <section aria-labelledby="funnel-heading" className="flex flex-col gap-2">
            <h2 id="funnel-heading" className="label-caps text-fg-muted">
              Funnel
            </h2>
            <ol className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(
                [
                  ['Signed up', data.funnel.signedUp],
                  ['Added a game ID', data.funnel.gameId],
                  ['Created or accepted a challenge', data.funnel.firstChallenge],
                  ['Finished a match', data.funnel.firstCompletedMatch],
                ] as const
              ).map(([label, n], i) => (
                <li key={label} className="rounded-card border border-line bg-surface p-4">
                  <span className="label-caps text-fg-muted">
                    {i + 1}. {label}
                  </span>
                  <span className="mt-1 block font-display text-stat-md font-semibold tabular text-fg">
                    {n}
                    {i > 0 && data.funnel.signedUp > 0 ? (
                      <span className="ml-2 text-body-sm font-normal text-fg-muted">
                        {Math.round((n / data.funnel.signedUp) * 100)}%
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-caption text-fg-muted">
              Week-4 retention counts players whose first finished match was at least 28 days ago:{' '}
              {data.retention.retained} of {data.retention.eligible}.
            </p>
          </section>

          <Table aria-label="Daily activity">
            <TableHead>
              <TableHeaderCell>Day</TableHeaderCell>
              <TableHeaderCell>Sign-ups</TableHeaderCell>
              <TableHeaderCell>Challenges</TableHeaderCell>
              <TableHeaderCell>Matches finished</TableHeaderCell>
            </TableHead>
            <TableBody>
              {[...data.series]
                .reverse()
                .slice(0, 28)
                .map((s) => (
                  <TableRow key={s.day}>
                    <TableCell className="tabular">{s.day}</TableCell>
                    <TableCell className="tabular">{s.signups}</TableCell>
                    <TableCell className="tabular">{s.challenges}</TableCell>
                    <TableCell className="tabular">{s.completed}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </>
      ) : null}
    </div>
  );
}
