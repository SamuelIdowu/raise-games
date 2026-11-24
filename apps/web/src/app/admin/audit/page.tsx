'use client';

import { useState } from 'react';
import { adminApi, type AuditRow } from '@raise/api-client';
import {
  Button,
  EmptyState,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { AdminHeader, LoadState, Pager, fmt, useAdminData } from '@/features/admin/admin-kit';

/** Audit log viewer (F12.1): every admin and moderation action, filterable. */
export default function AuditPage() {
  const [action, setAction] = useState('');
  const [object, setObject] = useState('');
  const [filters, setFilters] = useState<{ action?: string; objectId?: string }>({});
  const [limit, setLimit] = useState(25);
  const [extra, setExtra] = useState<AuditRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const { data, error, reload } = useAdminData(async () => {
    const page = await adminApi.audit({ ...filters, limit });
    setExtra([]);
    setCursor(page.nextCursor);
    return page;
  }, [filters, limit]);
  const rows = [...(data?.items ?? []), ...extra];
  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="Audit log" />
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ action: action.trim() || undefined, objectId: object.trim() || undefined });
        }}
      >
        <Input
          label="Action starts with"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="e.g. sanction."
          containerClassName="min-w-[12rem] flex-1"
        />
        <Input
          label="Object id"
          value={object}
          onChange={(e) => setObject(e.target.value)}
          containerClassName="min-w-[12rem] flex-1"
        />
        <label className="flex flex-col gap-1 text-body-sm text-fg-muted">
          Rows
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="h-11 rounded-control border border-line-strong bg-surface px-3 text-body text-fg"
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      <LoadState error={error} loading={!data && !error} onRetry={reload} />
      {data && rows.length === 0 ? (
        <EmptyState icon="info" title="No entries" description="Nothing matches these filters." />
      ) : null}
      {rows.length > 0 ? (
        <Table aria-label="Audit log">
          <TableHead>
            <TableHeaderCell>When</TableHeaderCell>
            <TableHeaderCell>Action</TableHeaderCell>
            <TableHeaderCell>Actor</TableHeaderCell>
            <TableHeaderCell>Object</TableHeaderCell>
            <TableHeaderCell>Details</TableHeaderCell>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{fmt(r.createdAt)}</TableCell>
                <TableCell className="font-mono text-caption">{r.action}</TableCell>
                <TableCell>
                  {r.actorName ?? (r.actorId ? r.actorId.slice(0, 8) : 'System')}
                </TableCell>
                <TableCell className="font-mono text-caption">
                  {r.objectType}:{r.objectId?.slice(0, 8)}
                </TableCell>
                <TableCell
                  className="max-w-[28rem] truncate font-mono text-caption"
                  title={JSON.stringify({ before: r.before, after: r.after })}
                >
                  {r.after ? JSON.stringify(r.after) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <Pager
        hasMore={!!cursor}
        onMore={async () => {
          const page = await adminApi.audit({ ...filters, limit, cursor: cursor ?? undefined });
          setExtra((e) => [...e, ...page.items]);
          setCursor(page.nextCursor);
        }}
      />
    </div>
  );
}
