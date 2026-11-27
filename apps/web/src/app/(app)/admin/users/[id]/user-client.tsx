'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { adminApi } from '@raise/api-client';
import {
  Banner,
  Button,
  Icon,
  ReputationBadge,
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
import { AdminHeader, LoadState, fmt, useAdminData, useStepUp } from '@/features/admin/admin-kit';

const REASON_LABEL: Record<string, string> = {
  reusedScreenshots: 'reused screenshots',
  actionedReports: 'upheld reports',
  disputesLostAsOpener: 'disputes opened and lost',
  reputationDebts: 'late cancels / no-shows',
};

export function UserDetailClient() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const withStepUp = useStepUp();
  const { data: u, error, reload } = useAdminData(() => adminApi.user(id), [id]);
  const [dialog, setDialog] = useState<null | 'sanction' | 'reveal' | 'role'>(null);
  const [text, setText] = useState('');
  const [role, setRole] = useState<'player' | 'moderator' | 'admin'>('player');
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!u) return <LoadState error={error} loading={!error} onRetry={reload} />;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await withStepUp(fn);
      toast({ title: ok });
      setDialog(null);
      setText('');
      reload();
    } catch (e) {
      toast({
        title: 'Action failed',
        description: e instanceof Error ? e.message : undefined,
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const s = u.standing;
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/users"
        className="inline-flex w-fit items-center gap-1 text-body-sm text-accent hover:underline"
      >
        <Icon name="chevron-left" size={16} /> Players
      </Link>
      <AdminHeader title={u.displayName ?? 'Player'}>
        <Button variant="danger" onClick={() => setDialog('sanction')}>
          Apply {u.sanctionPreview.label.toLowerCase()}
        </Button>
        <Button variant="secondary" onClick={() => setDialog('role')}>
          Change role
        </Button>
        <Button variant="ghost" onClick={() => setDialog('reveal')}>
          Reveal phone
        </Button>
      </AdminHeader>

      <dl className="grid grid-cols-2 gap-3 text-body-sm md:grid-cols-4">
        <div className="surface-card rounded-card p-3">
          <dt className="label-caps text-fg-muted">Phone</dt>
          <dd className="font-mono text-fg">{phone ?? u.phoneMasked}</dd>
        </div>
        <div className="surface-card rounded-card p-3">
          <dt className="label-caps text-fg-muted">Role</dt>
          <dd className="text-fg">
            {u.role}
            {u.role !== 'player' ? (
              <span className="text-fg-muted"> · MFA {u.mfaEnabled ? 'on' : 'off'}</span>
            ) : null}
          </dd>
        </div>
        <div className="surface-card rounded-card p-3">
          <dt className="label-caps text-fg-muted">Reputation</dt>
          <dd className="mt-1">
            <ReputationBadge level={u.reputation} />
          </dd>
        </div>
        <div className="surface-card rounded-card p-3">
          <dt className="label-caps text-fg-muted">Joined</dt>
          <dd className="text-fg">{fmt(u.createdAt)}</dd>
        </div>
      </dl>

      {s.sanction ? (
        <Banner variant="system">
          Active: {s.sanction.type.replace(/_/g, ' ')}
          {s.sanction.endsAt ? ` until ${fmt(s.sanction.endsAt)}` : ''}.{' '}
          {s.playBlocked ? 'Cannot create or accept challenges.' : ''}
        </Banner>
      ) : null}
      {s.autoLimit.limited ? (
        <Banner
          variant="needs-action"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                void run(
                  () => adminApi.clearFraud([u.id], 'Reviewed from the player record'),
                  'Limit cleared',
                )
              }
            >
              Clear limit
            </Button>
          }
        >
          New challenges paused automatically:{' '}
          {s.autoLimit.reasons.map((r) => REASON_LABEL[r] ?? r).join(', ')}.
        </Banner>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-h2 font-black uppercase text-fg">Sanction history</h2>
        {u.sanctions.length === 0 ? (
          <p className="text-body-sm text-fg-muted">Clean record.</p>
        ) : (
          <Table aria-label="Sanctions">
            <TableHead>
              <TableHeaderCell numeric>Step</TableHeaderCell>
              <TableHeaderCell>Type</TableHeaderCell>
              <TableHeaderCell>Reason</TableHeaderCell>
              <TableHeaderCell>Source</TableHeaderCell>
              <TableHeaderCell>Ends</TableHeaderCell>
              <TableHeaderCell>
                <span className="sr-only">Actions</span>
              </TableHeaderCell>
            </TableHead>
            <TableBody>
              {u.sanctions.map((x) => (
                <TableRow key={x.id}>
                  <TableCell numeric>{x.step ?? '—'}</TableCell>
                  <TableCell>{x.type.replace(/_/g, ' ')}</TableCell>
                  <TableCell>{x.reason}</TableCell>
                  <TableCell>{x.source}</TableCell>
                  <TableCell>
                    {x.revokedAt ? (
                      <StatusChip label="Revoked" variant="muted" />
                    ) : x.endsAt ? (
                      fmt(x.endsAt)
                    ) : x.type === 'warning' ? (
                      '—'
                    ) : (
                      'Permanent'
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!x.revokedAt && x.type !== 'warning' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void run(
                            () => adminApi.revokeSanction(x.id, 'Revoked from the player record'),
                            'Sanction revoked',
                          )
                        }
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-h2 font-black uppercase text-fg">Games</h2>
          {u.profiles.map((p) => (
            <p key={p.gameName} className="text-body-sm text-fg">
              {p.gameName}: <span className="tabular">{p.rating}</span> ·{' '}
              <span className="tabular">
                {p.wins}–{p.losses}–{p.draws}
              </span>{' '}
              <span className="text-fg-muted">({p.ratedMatches} rated)</span>
            </p>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-h2 font-black uppercase text-fg">Signals</h2>
          {u.sharedDevices.length === 0 ? (
            <p className="text-body-sm text-fg-muted">No shared devices.</p>
          ) : (
            u.sharedDevices.map((d) => (
              <p key={d.deviceId} className="text-body-sm text-fg">
                Device <span className="font-mono">{d.deviceId.slice(0, 10)}</span> also used by{' '}
                <span className="tabular">{d.otherAccounts}</span> other account(s)
              </p>
            ))
          )}
          <p className="text-body-sm text-fg-muted">
            Last 30 days:{' '}
            <span className="tabular">{s.autoLimit.counts.reusedScreenshots ?? 0}</span> reused
            screenshots, <span className="tabular">{s.autoLimit.counts.actionedReports ?? 0}</span>{' '}
            upheld reports,{' '}
            <span className="tabular">{s.autoLimit.counts.reputationDebts ?? 0}</span> late
            cancels/no-shows.
          </p>
        </div>
      </section>

      <Sheet
        open={dialog === 'sanction'}
        onClose={() => setDialog(null)}
        title={`Apply ${u.sanctionPreview.label.toLowerCase()}?`}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setDialog(null)}>
              Back
            </Button>
            <Button
              variant="danger"
              fullWidth
              loading={busy}
              disabled={text.trim().length < 5}
              onClick={() =>
                void run(() => adminApi.sanction(u.id, text.trim()), 'Sanction applied')
              }
            >
              Apply {u.sanctionPreview.label.toLowerCase()}
            </Button>
          </div>
        }
      >
        <p className="mb-3 text-body-sm text-fg-muted">
          Ladder: warning → 7-day suspension → 30-day suspension → permanent ban. The player is
          notified.
          {u.sanctionPreview.step === 4 ? ' A ban signs them out everywhere.' : ''}
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-body-sm text-fg-muted">Reason (kept on their record)</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="rounded-control border border-line-strong bg-surface p-3 text-body text-fg"
          />
        </label>
      </Sheet>

      <Sheet
        open={dialog === 'reveal'}
        onClose={() => setDialog(null)}
        title="Reveal phone number"
        footer={
          <Button
            fullWidth
            loading={busy}
            disabled={text.trim().length < 5}
            onClick={() =>
              void run(
                async () => setPhone((await adminApi.revealPhone(u.id, text.trim())).phone),
                'Phone revealed and logged',
              )
            }
          >
            Reveal
          </Button>
        }
      >
        <p className="mb-3 text-body-sm text-fg-muted">
          Admins only. Every reveal is written to the audit log with your reason.
        </p>
        <textarea
          aria-label="Why do you need it?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="w-full rounded-control border border-line-strong bg-surface p-3 text-body text-fg"
        />
      </Sheet>

      <Sheet
        open={dialog === 'role'}
        onClose={() => setDialog(null)}
        title="Change role"
        footer={
          <Button
            fullWidth
            loading={busy}
            onClick={() => void run(() => adminApi.setRole(u.id, role), 'Role changed')}
          >
            Change to {role}
          </Button>
        }
      >
        <select
          aria-label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
          className="h-11 lg:h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-body text-fg"
        >
          <option value="player">Player</option>
          <option value="moderator">Moderator</option>
          <option value="admin">Admin</option>
        </select>
        <p className="mt-3 text-body-sm text-fg-muted">
          Admins only. Removing staff rights signs the account out everywhere.
        </p>
      </Sheet>
    </div>
  );
}
