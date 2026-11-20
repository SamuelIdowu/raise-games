'use client';

import { useState } from 'react';
import { betaApi, type InviteCode } from '@raise/api-client';
import {
  Banner,
  Button,
  EmptyState,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from '@/components/ui';
import { AdminHeader, LoadState, fmt, useAdminData, useStepUp } from '@/features/admin/admin-kit';

/**
 * Closed-beta invites (Sprint 16, F16.1): codes per cohort, uses, pause, and the waitlist.
 * The gate itself is the `beta.invite_only` flag on the Flags page.
 */
export default function BetaInvitesPage() {
  const { toast } = useToast();
  const withStepUp = useStepUp();
  const codes = useAdminData(() => betaApi.codes(), []);
  const waitlist = useAdminData(() => betaApi.waitlist(), []);
  const [cohort, setCohort] = useState('');
  const [place, setPlace] = useState('');
  const [maxUses, setMaxUses] = useState('50');
  const [count, setCount] = useState('1');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    try {
      const res = await withStepUp(() =>
        betaApi.createCodes({
          cohort: cohort.trim(),
          place: place.trim() || null,
          maxUses: Number(maxUses) || 50,
          count: Math.min(50, Math.max(1, Number(count) || 1)),
        }),
      );
      toast({
        title: `${res.created.length} code(s) created`,
        description: res.created.map((c) => c.code).join(', '),
      });
      codes.reload();
    } catch (e) {
      toast({
        title: 'Could not create codes',
        description: (e as Error).message,
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: InviteCode) => {
    try {
      await withStepUp(() => betaApi.updateCode(c.id, { active: !c.active }));
      codes.reload();
    } catch (e) {
      toast({ title: 'Could not update', description: (e as Error).message, variant: 'error' });
    }
  };

  const invite = async (waitlistId: string, codeId: string) => {
    try {
      const res = await withStepUp(() => betaApi.inviteFromWaitlist(waitlistId, codeId));
      setMessage(`Send to ${res.phone}: ${res.message}`);
      waitlist.reload();
    } catch (e) {
      toast({ title: 'Could not invite', description: (e as Error).message, variant: 'error' });
    }
  };

  const active = codes.data?.codes.filter((c) => c.active) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <AdminHeader title="Beta invites" />
      {codes.data ? (
        <Banner variant="system">
          Invite-only signup is <strong>{codes.data.inviteOnly ? 'on' : 'off'}</strong>. Change it
          with <code>beta.invite_only</code> on the Flags page. Existing players can always sign in.
        </Banner>
      ) : null}

      <section
        aria-labelledby="new-code"
        className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
      >
        <h2 id="new-code" className="font-display text-h3 font-semibold text-fg">
          New codes
        </h2>
        <div className="grid gap-3 md:grid-cols-4">
          <Input
            label="Cohort"
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            helper="e.g. unilag-esports"
          />
          <Input label="Campus or city" value={place} onChange={(e) => setPlace(e.target.value)} />
          <Input
            label="Uses per code"
            inputMode="numeric"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ''))}
          />
          <Input
            label="How many codes"
            inputMode="numeric"
            value={count}
            onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div>
          <Button loading={busy} disabled={cohort.trim().length < 2} onClick={() => void create()}>
            Create codes
          </Button>
        </div>
      </section>

      <section aria-labelledby="codes-heading" className="flex flex-col gap-2">
        <h2 id="codes-heading" className="label-caps text-fg-muted">
          Codes
          {codes.data?.cohorts.length
            ? ` · ${codes.data.cohorts.map((c) => `${c.cohort} ${c.players}`).join(' · ')}`
            : ''}
        </h2>
        <LoadState
          error={codes.error}
          loading={!codes.data && !codes.error}
          onRetry={codes.reload}
        />
        {codes.data && codes.data.codes.length === 0 ? (
          <EmptyState
            icon="user-plus"
            title="No codes yet"
            description="Create a code per campus or community."
          />
        ) : null}
        {codes.data && codes.data.codes.length > 0 ? (
          <Table aria-label="Invite codes">
            <TableHead>
              <TableHeaderCell>Code</TableHeaderCell>
              <TableHeaderCell>Cohort</TableHeaderCell>
              <TableHeaderCell>Uses</TableHeaderCell>
              <TableHeaderCell>Expires</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>
                <span className="sr-only">Actions</span>
              </TableHeaderCell>
            </TableHead>
            <TableBody>
              {codes.data.codes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono tabular">{c.code}</TableCell>
                  <TableCell>
                    {c.cohort}
                    {c.place ? <span className="text-fg-muted"> · {c.place}</span> : null}
                  </TableCell>
                  <TableCell className="tabular">
                    {c.uses} / {c.maxUses}
                  </TableCell>
                  <TableCell>{c.expiresAt ? fmt(c.expiresAt) : 'Never'}</TableCell>
                  <TableCell>{c.active ? 'Active' : 'Paused'}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => void toggle(c)}>
                      {c.active ? 'Pause' : 'Resume'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </section>

      <section aria-labelledby="waitlist-heading" className="flex flex-col gap-2">
        <h2 id="waitlist-heading" className="label-caps text-fg-muted">
          Waitlist (kept 90 days)
        </h2>
        {message ? (
          <Banner
            variant="system"
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void navigator.clipboard.writeText(message)}
              >
                Copy
              </Button>
            }
          >
            {message}
          </Banner>
        ) : null}
        <LoadState
          error={waitlist.error}
          loading={!waitlist.data && !waitlist.error}
          onRetry={waitlist.reload}
        />
        {waitlist.data && waitlist.data.length === 0 ? (
          <p className="text-body-sm text-fg-muted">Nobody is waiting.</p>
        ) : null}
        {waitlist.data && waitlist.data.length > 0 ? (
          <Table aria-label="Waitlist">
            <TableHead>
              <TableHeaderCell>Phone</TableHeaderCell>
              <TableHeaderCell>Campus or city</TableHeaderCell>
              <TableHeaderCell>Joined</TableHeaderCell>
              <TableHeaderCell>Invite</TableHeaderCell>
            </TableHead>
            <TableBody>
              {waitlist.data.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="tabular">{w.phone}</TableCell>
                  <TableCell>{w.place ?? '—'}</TableCell>
                  <TableCell>{fmt(w.createdAt)}</TableCell>
                  <TableCell>
                    {w.invitedAt ? (
                      <span className="text-fg-muted">
                        Invited {fmt(w.invitedAt)} · {w.code}
                      </span>
                    ) : active.length ? (
                      <select
                        aria-label="Invite with code"
                        defaultValue=""
                        onChange={(e) => e.target.value && void invite(w.id, e.target.value)}
                        className="h-9 rounded-card border border-line bg-raised px-2 text-body-sm text-fg"
                      >
                        <option value="">Invite with…</option>
                        {active.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} ({c.cohort})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-fg-muted">Create a code first</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </section>
    </div>
  );
}
