'use client';

import { useState } from 'react';
import Link from 'next/link';
import { adminApi, type AdminUserRow } from '@raise/api-client';
import {
  Button,
  EmptyState,
  Input,
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
  fmt,
  useAdminData,
  useStepUp,
} from '@/features/admin/admin-kit';

/** Players admin (F12.1): search with masked phones, bulk sanction / clear (F12.5). */
export default function UsersPage() {
  const { toast } = useToast();
  const withStepUp = useStepUp();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [extra, setExtra] = useState<AdminUserRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, error, reload } = useAdminData(async () => {
    const page = await adminApi.users({ q: query || undefined, limit: 25 });
    setExtra([]);
    setCursor(page.nextCursor);
    return page;
  }, [query]);
  const rows = [...(data?.items ?? []), ...extra];

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulk = async (kind: 'sanction' | 'clear') => {
    setBusy(true);
    try {
      if (kind === 'sanction') {
        const res = await withStepUp(() =>
          adminApi.bulkSanction([...picked], reason.trim(), crypto.randomUUID()),
        );
        const failed = res.results.filter((r) => !r.ok).length;
        toast({
          title: `Sanctions applied to ${res.results.length - failed}`,
          description: failed ? `${failed} could not be sanctioned.` : undefined,
        });
      } else {
        const res = await adminApi.clearFraud([...picked], reason.trim());
        toast({ title: `Cleared ${res.cleared} account(s)` });
      }
      setPicked(new Set());
      setReason('');
      reload();
    } catch (e) {
      toast({
        title: 'Bulk action failed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="Players" />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <Input
          aria-label="Search players"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Username, or a full phone number"
          containerClassName="flex-1"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {picked.size > 0 ? (
        // Bulk-action bar (Design §8 tables).
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-card border border-accent/40 bg-raised p-3"
        >
          <span className="text-body-sm text-fg">
            <span className="tabular">{picked.size}</span> selected
          </span>
          <input
            aria-label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            className="h-8 min-w-[12rem] flex-1 surface-card rounded-card px-2 text-body-sm text-fg"
          />
          <Button
            size="sm"
            variant="danger"
            loading={busy}
            disabled={reason.trim().length < 5}
            onClick={() => void bulk('sanction')}
          >
            Apply next step
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            disabled={reason.trim().length < 3}
            onClick={() => void bulk('clear')}
          >
            Clear fraud limits
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
            Deselect
          </Button>
        </div>
      ) : null}

      <LoadState error={error} loading={!data && !error} onRetry={reload} />
      {data && rows.length === 0 ? (
        <EmptyState icon="user" title="No players found" description="Try a different username." />
      ) : null}
      {rows.length > 0 ? (
        <Table aria-label="Players">
          <TableHead>
            <TableHeaderCell>
              <span className="sr-only">Select</span>
            </TableHeaderCell>
            <TableHeaderCell>Player</TableHeaderCell>
            <TableHeaderCell>Phone</TableHeaderCell>
            <TableHeaderCell>Role</TableHeaderCell>
            <TableHeaderCell>Joined</TableHeaderCell>
            <TableHeaderCell>Standing</TableHeaderCell>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} selected={picked.has(r.id)}>
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.displayName ?? r.id}`}
                    checked={picked.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="size-4"
                  />
                </TableCell>
                <TableCell>
                  <Link href={`/admin/users/${r.id}`} className="text-accent hover:underline">
                    {r.displayName ?? r.id.slice(0, 8)}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-caption">{r.phoneMasked}</TableCell>
                <TableCell>{r.role}</TableCell>
                <TableCell>{fmt(r.createdAt)}</TableCell>
                <TableCell>
                  {r.sanctioned ? (
                    <StatusChip label="Sanctioned" variant="dispute" />
                  ) : (
                    <StatusChip label="Good standing" variant="neutral" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <Pager
        hasMore={!!cursor}
        onMore={async () => {
          const page = await adminApi.users({
            q: query || undefined,
            limit: 25,
            cursor: cursor ?? undefined,
          });
          setExtra((e) => [...e, ...page.items]);
          setCursor(page.nextCursor);
        }}
      />
    </div>
  );
}
