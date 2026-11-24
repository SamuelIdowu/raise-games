'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  adminApi,
  type DisputeViewer,
  type RulingOutcome,
  type ViewerPlayer,
} from '@raise/api-client';
import {
  Banner,
  Button,
  Icon,
  OutcomeSelector,
  RatingBadge,
  ReputationBadge,
  Sheet,
  StatusChip,
  useToast,
} from '@/components/ui';
import {
  AdminHeader,
  LoadState,
  SlaClock,
  fmt,
  useAdminData,
  useStepUp,
} from '@/features/admin/admin-kit';
import { cn } from '@/lib/cn';

type EvidenceTab = 'results' | 'proof' | 'chat' | 'players';

const OUTCOME_LABEL = (v: DisputeViewer, o: RulingOutcome) => {
  const name = (side: number) =>
    v.players.find((p) => p.side === side)?.username ?? `Player ${side + 1}`;
  if (o === 'side0_win') return `${name(0)} wins`;
  if (o === 'side1_win') return `${name(1)} wins`;
  if (o === 'draw') return 'Draw';
  return 'Void (match does not count)';
};

export function DisputeViewerClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const withStepUp = useStepUp();
  const { data: v, error, reload } = useAdminData(() => adminApi.viewer(id), [id]);
  const [tab, setTab] = useState<EvidenceTab>('results');
  const [outcome, setOutcome] = useState<RulingOutcome | null>(null);
  const [justification, setJustification] = useState('');
  const [sanctionOn, setSanctionOn] = useState(false);
  const [sanctionUser, setSanctionUser] = useState<string>('');
  const [sanctionReason, setSanctionReason] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  if (!v) return <LoadState error={error} loading={!error} onRetry={reload} />;

  const closed = v.dispute.state === 'resolved';
  const name = (userId: string | null) =>
    v.players.find((p) => p.userId === userId)?.username ?? 'System';
  const sanctionTarget = v.players.find((p) => p.userId === sanctionUser) ?? null;
  const canDecide =
    !!outcome &&
    justification.trim().length >= 10 &&
    (!sanctionOn || (!!sanctionTarget && sanctionReason.trim().length >= 5));

  const decide = async () => {
    setBusy(true);
    try {
      await withStepUp(() =>
        adminApi.decide(v.dispute.id, {
          outcome: outcome!,
          justification: justification.trim(),
          sanction:
            sanctionOn && sanctionTarget
              ? { userId: sanctionTarget.userId, reason: sanctionReason.trim() }
              : null,
        }),
      );
      toast({
        title: 'Ruling recorded',
        description: 'Both players are notified. Ratings update in a few seconds.',
      });
      setConfirming(false);
      router.push('/admin/disputes');
    } catch (e) {
      toast({
        title: 'Could not record the ruling',
        description: e instanceof Error ? e.message : undefined,
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await adminApi.addNote(v.dispute.id, note.trim());
    setNote('');
    reload();
  };

  const evidenceTabs: Array<{ key: EvidenceTab; label: string }> = [
    { key: 'results', label: 'Submissions' },
    { key: 'proof', label: `Screenshots (${v.proof.length})` },
    { key: 'chat', label: `Chat (${v.chat.messages.length})` },
    { key: 'players', label: 'Players' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/disputes"
        className="inline-flex w-fit items-center gap-1 text-body-sm text-accent hover:underline"
      >
        <Icon name="chevron-left" size={16} /> Queue
      </Link>
      {/* Header: match id, game, both players with rating + reputation, SLA clock (Design §8). */}
      <AdminHeader title={`Dispute · ${v.match?.gameName ?? ''}`}>
        {!closed ? (
          <SlaClock dueAt={v.dispute.sla.dueAt} breached={v.dispute.sla.breached} />
        ) : (
          <StatusChip label="Resolved" variant="muted" />
        )}
      </AdminHeader>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-body-sm text-fg-muted">
        <span>
          Match <span className="font-mono text-fg">{v.match?.id.slice(0, 8)}</span> ·{' '}
          {v.match?.formatName}
        </span>
        {v.players.map((p) => (
          <span key={p.userId} className="inline-flex items-center gap-2">
            <span className="text-fg">{p.username}</span>
            <RatingBadge value={p.rating} provisional={p.provisional} />
            <ReputationBadge level={p.reputation} />
          </span>
        ))}
        <span>
          Reason:{' '}
          <span className="text-fg">
            {(v.dispute.category ?? v.dispute.reason).replace(/_/g, ' ')}
          </span>
        </span>
      </div>
      {v.dispute.detail ? <Banner variant="system">“{v.dispute.detail}”</Banner> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Evidence: side by side on desktop, tabbed on mobile. */}
        <section aria-label="Evidence" className="flex min-w-0 flex-col gap-3">
          <div
            role="tablist"
            aria-label="Evidence"
            className="flex gap-1 overflow-x-auto border-b border-line lg:hidden"
          >
            {evidenceTabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'min-h-11 whitespace-nowrap border-b-2 px-3 font-display text-body-sm font-semibold',
                  tab === t.key ? 'border-accent text-accent' : 'border-transparent text-fg-muted',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className={cn('grid gap-3 lg:grid-cols-2', tab !== 'results' && 'max-lg:hidden')}>
            {v.players.map((p) => {
              const sub = v.submissions.find((s) => s.submitterId === p.userId);
              return (
                <article
                  key={p.userId}
                  className="flex flex-col gap-2 surface-card rounded-card p-4"
                >
                  <h3 className="font-display text-h3 font-black uppercase text-fg">
                    {p.username}’s submission
                  </h3>
                  {sub ? (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
                      <dt className="text-fg-muted">Outcome</dt>
                      <dd className="text-fg">
                        {sub.kind === 'no_show' ? 'Opponent did not show' : sub.result}
                      </dd>
                      <dt className="text-fg-muted">Score</dt>
                      <dd className="tabular text-fg">
                        {sub.score && typeof sub.score.self === 'number'
                          ? `${sub.score.self} – ${sub.score.opponent}`
                          : '—'}
                      </dd>
                      <dt className="text-fg-muted">Submitted</dt>
                      <dd className="text-fg">{fmt(sub.submittedAt)}</dd>
                      {sub.note ? (
                        <>
                          <dt className="text-fg-muted">Note</dt>
                          <dd className="text-fg">“{sub.note}”</dd>
                        </>
                      ) : null}
                    </dl>
                  ) : (
                    <p className="text-body-sm text-fg-muted">No submission.</p>
                  )}
                </article>
              );
            })}
          </div>

          <div className={cn('flex flex-col gap-2', tab !== 'proof' && 'max-lg:hidden')}>
            <h3 className="font-display text-h3 font-black uppercase text-fg max-lg:sr-only">
              Screenshots
            </h3>
            {v.proof.length === 0 ? (
              <p className="text-body-sm text-fg-muted">No screenshots.</p>
            ) : null}
            <ul className="flex flex-wrap gap-3">
              {v.proof.map((u) => (
                <li key={u.uploadId} className="flex w-40 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => u.urls && setZoom(u.urls.full)}
                    disabled={!u.urls}
                    aria-label={`Open ${name(u.ownerId)}’s screenshot full size`}
                    className="aspect-video overflow-hidden rounded-card border border-line bg-raised"
                  >
                    {u.urls ? (
                      // Signed, expiring private-bucket URL (Design §6: untrusted content).
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.urls.thumb}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Icon name="image" size={24} className="m-auto text-fg-subtle" />
                    )}
                  </button>
                  <span className="text-caption text-fg-muted">{name(u.ownerId)}</span>
                  {u.flag ? (
                    <span className="inline-flex items-start gap-1 text-caption text-dispute">
                      <Icon name="alert-triangle" size={14} className="mt-0.5 shrink-0" />
                      <span>
                        {u.flag.kind === 'reused'
                          ? 'Reused screenshot'
                          : `Near-duplicate (distance ${u.flag.distance})`}
                        {u.flag.earlierMatchId ? (
                          <>
                            {' '}
                            — match{' '}
                            <span className="font-mono">{u.flag.earlierMatchId.slice(0, 8)}</span>
                          </>
                        ) : null}
                      </span>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div className={cn('flex flex-col gap-2', tab !== 'chat' && 'max-lg:hidden')}>
            <h3 className="font-display text-h3 font-black uppercase text-fg max-lg:sr-only">
              Chat transcript
            </h3>
            <ol className="flex max-h-96 flex-col gap-1 overflow-y-auto surface-card rounded-card p-3 text-body-sm">
              {v.chat.messages.length === 0 ? (
                <li className="text-fg-muted">No messages.</li>
              ) : null}
              {v.chat.messages.map((msg) => (
                <li
                  key={msg.id}
                  className={cn(msg.kind === 'system' && 'text-center text-caption text-fg-muted')}
                >
                  {msg.kind === 'system' ? (
                    msg.body
                  ) : (
                    <>
                      <span className="text-caption text-fg-muted">{fmt(msg.createdAt)} · </span>
                      <span className="font-semibold text-fg">{name(msg.senderId)}: </span>
                      <span className="text-fg">{msg.body}</span>
                    </>
                  )}
                </li>
              ))}
            </ol>
            <p className="font-mono text-caption text-fg-subtle">
              Transcript digest {v.chat.digest.slice(0, 16)}…
            </p>
          </div>

          <div className={cn('grid gap-3 lg:grid-cols-2', tab !== 'players' && 'max-lg:hidden')}>
            {v.players.map((p) => (
              <PlayerCard key={p.userId} p={p} />
            ))}
          </div>

          <section aria-label="Internal notes" className="flex flex-col gap-2">
            <h3 className="font-display text-h3 font-black uppercase text-fg">Internal notes</h3>
            <ul className="flex flex-col gap-1 text-body-sm">
              {v.notes.map((n) => (
                <li key={n.id} className="surface-card rounded-card p-2">
                  <span className="text-caption text-fg-muted">
                    {n.authorName} · {fmt(n.createdAt)}
                  </span>
                  <p className="text-fg">{n.body}</p>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="mod-note">
                Add an internal note
              </label>
              <input
                id="mod-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Only moderators see notes"
                className="h-11 flex-1 rounded-control border border-line-strong bg-surface px-3 text-body text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
              />
              <Button variant="secondary" onClick={() => void addNote()} disabled={!note.trim()}>
                Add note
              </Button>
            </div>
          </section>
        </section>

        {/* Decision panel (Design §8): outcome, reason template, sanction toggle w/ ladder step. */}
        <aside
          aria-label="Decision"
          className="flex flex-col gap-4 self-start surface-card rounded-card p-4 lg:sticky lg:top-20"
        >
          <h2 className="font-display text-h2 font-black uppercase text-fg">Decision</h2>
          {closed ? (
            <p className="text-body-sm text-fg-muted">
              This dispute has a ruling. An appeal reopens it in the queue.
            </p>
          ) : (
            <>
              <OutcomeSelector<RulingOutcome>
                legend="Outcome"
                value={outcome}
                onChange={setOutcome}
                options={(['side0_win', 'side1_win', 'draw', 'void'] as const).map((o) => ({
                  value: o,
                  label: OUTCOME_LABEL(v, o),
                }))}
              />
              <label className="flex flex-col gap-1">
                <span className="text-body-sm text-fg-muted">Reason template</span>
                <select
                  onChange={(e) => {
                    const t = v.templates.find((x) => x.key === e.target.value);
                    if (t) {
                      setJustification(t.text);
                      if (t.outcome) setOutcome(t.outcome);
                    }
                  }}
                  defaultValue=""
                  className="h-11 rounded-control border border-line-strong bg-surface px-3 text-body text-fg focus:border-accent focus:outline-none"
                >
                  <option value="" disabled>
                    Choose a template
                  </option>
                  {v.templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.text}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-body-sm text-fg-muted">Reason shown to both players</span>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  className="rounded-control border border-line-strong bg-surface p-3 text-body text-fg focus:border-accent focus:outline-none"
                />
              </label>

              <fieldset className="flex flex-col gap-2 rounded-card border border-line p-3">
                <legend className="px-1 text-body-sm text-fg-muted">Sanction</legend>
                <label className="inline-flex min-h-11 items-center gap-2 text-body-sm text-fg">
                  <input
                    type="checkbox"
                    checked={sanctionOn}
                    onChange={(e) => setSanctionOn(e.target.checked)}
                    className="size-4"
                  />
                  Apply the next ladder step
                </label>
                {sanctionOn ? (
                  <>
                    <select
                      aria-label="Player to sanction"
                      value={sanctionUser}
                      onChange={(e) => setSanctionUser(e.target.value)}
                      className="h-11 rounded-control border border-line-strong bg-surface px-3 text-body text-fg"
                    >
                      <option value="" disabled>
                        Choose a player
                      </option>
                      {v.players.map((p) => (
                        <option key={p.userId} value={p.userId}>
                          {p.username} — next: {p.sanctionPreview.label}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Sanction reason"
                      value={sanctionReason}
                      onChange={(e) => setSanctionReason(e.target.value)}
                      placeholder="Reason (kept on their record)"
                      className="h-11 rounded-control border border-line-strong bg-surface px-3 text-body text-fg placeholder:text-fg-subtle"
                    />
                  </>
                ) : null}
              </fieldset>

              <Button
                size="lg"
                fullWidth
                disabled={!canDecide}
                hint={
                  !canDecide ? 'Choose an outcome and write a reason (10+ characters).' : undefined
                }
                onClick={() => setConfirming(true)}
              >
                Review ruling
              </Button>
            </>
          )}
        </aside>
      </div>

      {/* Confirmation: summarise effects before applying (Design §8). */}
      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Apply this ruling?"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button fullWidth loading={busy} onClick={() => void decide()}>
              Apply ruling
            </Button>
          </div>
        }
      >
        {outcome ? (
          <ul className="flex flex-col gap-2 text-body-sm text-fg">
            <li>
              <span className="text-fg-muted">Outcome:</span> {OUTCOME_LABEL(v, outcome)}
            </li>
            <li>
              <span className="text-fg-muted">Ratings now:</span>{' '}
              {outcome === 'void'
                ? 'no rating change (any earlier change is reversed)'
                : outcome === 'draw'
                  ? 'rated as a draw for both players'
                  : 'the winner gains and the other player loses rating'}
            </li>
            <li>
              <span className="text-fg-muted">Stage 2 (not live):</span> stakes would be released or
              refunded by this ruling.
            </li>
            <li>
              <span className="text-fg-muted">Sanction:</span>{' '}
              {sanctionOn && sanctionTarget
                ? `${sanctionTarget.sanctionPreview.label} for ${sanctionTarget.username}`
                : 'none'}
            </li>
            <li>
              <span className="text-fg-muted">Both players are notified</span>, can see your reason,
              and may appeal once.
            </li>
          </ul>
        ) : null}
      </Sheet>

      <Sheet open={zoom !== null} onClose={() => setZoom(null)} title="Screenshot" size="lg">
        {zoom ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={zoom}
            alt="Result screenshot, full size"
            referrerPolicy="no-referrer"
            className="w-full rounded-card"
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function PlayerCard({ p }: { p: ViewerPlayer }) {
  return (
    <article className="flex flex-col gap-2 surface-card rounded-card p-4 text-body-sm">
      <h3 className="font-display text-h3 font-black uppercase text-fg">{p.username}</h3>
      <div className="flex flex-wrap items-center gap-2">
        <RatingBadge value={p.rating} provisional={p.provisional} />
        <span className="text-fg-muted">{p.rankLabel}</span>
        <ReputationBadge level={p.reputation} />
      </div>
      <p className="text-fg-muted">
        Disputes: <span className="tabular text-fg">{p.disputeHistory.total}</span> · opened{' '}
        <span className="tabular text-fg">{p.disputeHistory.opened}</span> · lost{' '}
        <span className="tabular text-fg">{p.disputeHistory.lost}</span>
      </p>
      {p.standing.sanction ? (
        <StatusChip
          label={`Sanctioned: ${p.standing.sanction.type.replace(/_/g, ' ')}`}
          variant="dispute"
          icon="alert-triangle"
        />
      ) : null}
      {p.standing.autoLimit.limited ? (
        <StatusChip label="Auto-limited" variant="dispute" icon="alert-triangle" />
      ) : null}
      <Link href={`/admin/users/${p.userId}`} className="text-accent hover:underline">
        Player record
      </Link>
    </article>
  );
}
