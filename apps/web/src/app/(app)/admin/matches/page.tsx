'use client';

import { useState } from 'react';
import Link from 'next/link';
import { adminApi, type AdminMatchDetail, type AdminMatchRow } from '@raise/api-client';
import {
  Button,
  EmptyState,
  Input,
  Sheet,
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

const STATUSES = [
  'accepted',
  'in_progress',
  'awaiting_result',
  'awaiting_confirmation',
  'confirmed',
  'disputed',
  'resolved',
  'cancelled',
  'expired',
  'forfeited',
  'voided',
] as const;

const label = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Matches (audit B22; UX Flow 11): find any match by player, status or "stuck", inspect its
 * timeline, and void a stuck live match with a reason. Disputed and decided matches link to
 * their dispute instead, where a ruling also reverses ratings and payouts.
 */
export default function MatchesPage() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [stuck, setStuck] = useState(false);
  const [extra, setExtra] = useState<AdminMatchRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const filters = { q: query || undefined, status: status || undefined, stuck: stuck || undefined };
  const { data, error, reload } = useAdminData(async () => {
    const page = await adminApi.matches({ ...filters, limit: 25 });
    setExtra([]);
    setCursor(page.nextCursor);
    return page;
  }, [query, status, stuck]);
  const rows = [...(data?.items ?? []), ...extra];

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader title="Matches" />
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <Input
          aria-label="Search by player"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Player username"
          containerClassName="min-w-[12rem] flex-1"
        />
        <label className="flex flex-col gap-1 text-body-sm text-fg-muted">
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-11 rounded-control border border-line bg-surface px-2 text-fg"
          >
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-11 items-center gap-2 text-body-sm text-fg">
          <input
            type="checkbox"
            checked={stuck}
            onChange={(e) => setStuck(e.target.checked)}
            className="size-4"
          />
          Stuck only
        </label>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <LoadState error={error} loading={!data && !error} onRetry={reload} />
      {data && rows.length === 0 ? (
        <EmptyState
          icon="trophy"
          title="No matches found"
          description="Try another player or clear the filters."
        />
      ) : null}
      {rows.length > 0 ? (
        <Table aria-label="Matches">
          <TableHead>
            <TableHeaderCell>Players</TableHeaderCell>
            <TableHeaderCell>Game</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Created</TableHeaderCell>
            <TableHeaderCell>Last change</TableHeaderCell>
          </TableHead>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => setOpenId(m.id)}
                    className="text-left text-accent hover:underline"
                  >
                    {m.players.join(' vs ')}
                  </button>
                </TableCell>
                <TableCell>{m.game}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1">
                    <StatusChip label={label(m.status)} variant="neutral" />
                    {m.stuck ? <StatusChip label="Stuck" variant="dispute" /> : null}
                  </span>
                </TableCell>
                <TableCell>{fmt(m.createdAt)}</TableCell>
                <TableCell>{fmt(m.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <Pager
        hasMore={!!cursor}
        onMore={async () => {
          const page = await adminApi.matches({
            ...filters,
            limit: 25,
            cursor: cursor ?? undefined,
          });
          setExtra((e) => [...e, ...page.items]);
          setCursor(page.nextCursor);
        }}
      />

      {openId ? (
        <MatchSheet
          id={openId}
          onClose={() => setOpenId(null)}
          onVoided={() => {
            setOpenId(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function MatchSheet({
  id,
  onClose,
  onVoided,
}: {
  id: string;
  onClose: () => void;
  onVoided: () => void;
}) {
  const { toast } = useToast();
  const withStepUp = useStepUp();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, error, reload } = useAdminData<AdminMatchDetail>(() => adminApi.match(id), [id]);
  const name = (userId: string) =>
    data?.sides.find((s) => s.userId === userId)?.displayName ?? userId.slice(0, 8);

  const voidMatch = async () => {
    setBusy(true);
    try {
      await withStepUp(() => adminApi.voidMatch(id, reason.trim()));
      toast({ title: 'Match voided', description: 'Stakes are returned and both players see it.' });
      onVoided();
    } catch (e) {
      toast({
        title: 'Could not void the match',
        description: e instanceof Error ? e.message : undefined,
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title="Match" size="lg">
      <LoadState error={error} loading={!data && !error} onRetry={reload} />
      {data ? (
        <div className="flex flex-col gap-4 text-body-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={label(data.status)} variant="neutral" />
            <span className="text-fg-muted">{data.game}</span>
            {data.decidedVia ? (
              <span className="text-fg-muted">Decided by {label(data.decidedVia)}</span>
            ) : null}
          </div>

          <section aria-label="Players">
            <h3 className="mb-1 font-display text-body-sm font-semibold text-fg">Players</h3>
            <ul className="flex flex-col gap-1">
              {data.sides.map((s) => (
                <li key={s.userId}>
                  <Link href={`/admin/users/${s.userId}`} className="text-accent hover:underline">
                    {s.displayName ?? s.userId.slice(0, 8)}
                  </Link>
                  {data.winnerSide === s.side ? ' (winner)' : ''}
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Timeline">
            <h3 className="mb-1 font-display text-body-sm font-semibold text-fg">Timeline</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {Object.entries(data.timeline)
                .filter(([, at]) => at)
                .map(([k, at]) => (
                  <div key={k} className="contents">
                    <dt className="text-fg-muted">
                      {label(
                        k
                          .replace(/At$/, '')
                          .replace(/([A-Z])/g, '_$1')
                          .toLowerCase(),
                      )}
                    </dt>
                    <dd className="tabular">{fmt(at)}</dd>
                  </div>
                ))}
            </dl>
          </section>

          <section aria-label="Submissions">
            <h3 className="mb-1 font-display text-body-sm font-semibold text-fg">Submissions</h3>
            {data.submissions.length === 0 ? (
              <p className="text-fg-muted">No results submitted.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {data.submissions.map((s, i) => (
                  <li key={i}>
                    {name(s.userId)}: {label(s.kind)} — {s.result} ({fmt(s.createdAt)})
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.dispute ? (
            <p>
              <Link
                href={`/admin/disputes/${data.dispute.id}`}
                className="text-accent hover:underline"
              >
                Open the dispute ({label(data.dispute.status)})
              </Link>
            </p>
          ) : null}

          {data.voidable ? (
            <section
              aria-label="Void match"
              className="flex flex-col gap-2 border-t border-line pt-3"
            >
              <h3 className="font-display text-body-sm font-semibold text-fg">Void this match</h3>
              <p className="text-fg-muted">
                For a stuck or broken match. It will not count for ratings, any stakes are returned,
                and both players see a note in the match chat. Needs a fresh authenticator code.
              </p>
              <textarea
                aria-label="Reason for voiding"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Reason (at least 10 characters, kept in the audit log)"
                className="rounded-control border border-line bg-surface p-2 text-fg"
              />
              <div>
                <Button
                  variant="danger"
                  loading={busy}
                  disabled={reason.trim().length < 10}
                  onClick={() => void voidMatch()}
                >
                  Void match
                </Button>
              </div>
            </section>
          ) : (
            <p className="border-t border-line pt-3 text-fg-muted">
              {data.status === 'disputed'
                ? 'This match is disputed: void it from the dispute with a ruling.'
                : 'Decided or closed matches change only through a dispute or appeal.'}
            </p>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
