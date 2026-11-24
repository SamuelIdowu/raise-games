'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { disputesApi, type DisputeRuling, type DisputeView } from '@raise/api-client';
import { Button, Icon, ProofUpload, Sheet, StatusChip, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { DISPUTE_CATEGORY_LABELS, disputeCopy, outcomeLabel } from '@/lib/copy/disputes';
import { resultCopy } from '@/lib/copy/results';
import { formatAbsolute } from '@/lib/time';
import { useProofUpload } from '@/lib/use-proof-upload';

/**
 * Dispute panel in the match room (UX Flow 6, F9.2): shared status tracker (a stepper both
 * players see identically), evidence, the ruling with the moderator's reason, and the
 * single appeal. Re-reads itself whenever the room receives a live update (`refreshKey`).
 */
export function DisputePanel({
  matchId,
  refreshKey,
  onChanged,
}: {
  matchId: string;
  refreshKey: number;
  onChanged: () => void;
}) {
  const [dispute, setDispute] = useState<DisputeView | null | undefined>(undefined);
  const [sheet, setSheet] = useState<null | 'evidence' | 'appeal'>(null);
  const [session, setSession] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await disputesApi.forMatch(matchId);
      setDispute(res.dispute);
    } catch {
      setDispute((d) => d ?? null);
    }
  }, [matchId]);

  useEffect(() => {
    // load() sets state only after its fetch resolves; the rule cannot see past the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  if (!dispute) return null;

  const openSheet = (kind: 'evidence' | 'appeal') => {
    setSession((n) => n + 1);
    setSheet(kind);
  };
  const done = async () => {
    setSheet(null);
    await load();
    onChanged();
  };

  return (
    <section
      aria-labelledby="dispute-heading"
      className="rounded-card border border-dispute/40 bg-surface p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2
          id="dispute-heading"
          className="flex items-center gap-2 font-display text-h3 font-black uppercase text-fg"
        >
          <Icon name="alert-triangle" size={18} className="text-dispute" aria-hidden />
          {disputeCopy.panel.title}
        </h2>
        <StatusChip
          label={dispute.tracker.find((s) => s.state === 'current')?.label ?? 'Closed'}
          variant={dispute.status === 'final' || dispute.status === 'ruled' ? 'neutral' : 'dispute'}
          icon={dispute.status === 'final' || dispute.status === 'ruled' ? 'check-circle' : 'clock'}
        />
      </div>

      {/* Shared tracker: an ordered list read as a sequence by screen readers. */}
      <ol aria-label="Dispute progress" className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
        {dispute.tracker.map((step) => (
          <li key={step.key} className="flex items-center gap-1.5 text-caption">
            <span
              aria-hidden
              className={cn(
                'flex size-4 items-center justify-center rounded-full border',
                step.state === 'done' && 'border-fg-muted text-fg-muted',
                step.state === 'current' && 'border-dispute bg-dispute/20',
                step.state === 'upcoming' && 'border-line',
              )}
            >
              {step.state === 'done' ? <Icon name="check" size={10} /> : null}
            </span>
            <span className={step.state === 'current' ? 'font-semibold text-fg' : 'text-fg-muted'}>
              {step.label}
            </span>
            <span className="sr-only">
              ,{' '}
              {step.state === 'done'
                ? 'done'
                : step.state === 'current'
                  ? 'in progress'
                  : 'not started'}
            </span>
          </li>
        ))}
      </ol>

      <dl className="mb-3 space-y-1 text-body-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-fg-muted">Reason</dt>
          <dd className="text-right text-fg">
            {dispute.category ? DISPUTE_CATEGORY_LABELS[dispute.category] : 'Results do not match'}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-fg-muted">Opened</dt>
          <dd className="text-right text-fg">{formatAbsolute(dispute.openedAt)}</dd>
        </div>
      </dl>
      <p className="mb-3 text-caption text-fg-muted">
        {dispute.source === 'auto_conflict' || dispute.source === 'no_show_contested'
          ? disputeCopy.panel.openedBySystem
          : dispute.openedByViewer
            ? disputeCopy.panel.openedByYou
            : disputeCopy.panel.openedByOpponent}{' '}
        {disputeCopy.panel.evidenceMine(dispute.myEvidence.length)},{' '}
        {disputeCopy.panel.evidenceTheirs(dispute.opponentEvidenceCount)}.
      </p>

      {dispute.ruling ? <RulingView ruling={dispute.ruling} /> : null}
      {dispute.previousRuling ? (
        <details className="mt-2 text-body-sm">
          <summary className="cursor-pointer text-fg-muted">{disputeCopy.ruling.previous}</summary>
          <RulingView ruling={dispute.previousRuling} compact />
        </details>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        {dispute.canAddEvidence ? (
          <Button variant="secondary" fullWidth onClick={() => openSheet('evidence')}>
            {disputeCopy.panel.addEvidence}
          </Button>
        ) : null}
        {dispute.ruling ? (
          <Button
            variant="secondary"
            fullWidth
            disabled={!dispute.appeal.canAppeal}
            hint={
              dispute.appeal.canAppeal ? undefined : (dispute.appeal.blockedReason ?? undefined)
            }
            onClick={() => openSheet('appeal')}
          >
            {disputeCopy.appeal.cta}
          </Button>
        ) : null}
      </div>

      {sheet === 'evidence' ? (
        <EvidenceSheet
          key={session}
          matchId={matchId}
          dispute={dispute}
          onClose={() => setSheet(null)}
          onDone={done}
        />
      ) : null}
      {sheet === 'appeal' ? (
        <AppealSheet key={session} dispute={dispute} onClose={() => setSheet(null)} onDone={done} />
      ) : null}
    </section>
  );
}

function RulingView({ ruling, compact = false }: { ruling: DisputeRuling; compact?: boolean }) {
  return (
    <section
      aria-label={ruling.round === 2 ? disputeCopy.ruling.appealTitle : disputeCopy.ruling.title}
      className={cn('rounded-card border border-line bg-raised p-3', compact && 'mt-2')}
    >
      <p className="font-display text-body font-semibold text-fg">
        {ruling.round === 2 ? disputeCopy.ruling.appealTitle : disputeCopy.ruling.title}:{' '}
        {outcomeLabel(ruling.outcomeForViewer, ruling.outcome)}
      </p>
      <p className="mt-1 text-caption text-fg-muted">{formatAbsolute(ruling.ruledAt)}</p>
      <h3 className="label-caps mt-2 text-fg-muted">{disputeCopy.ruling.reason}</h3>
      <p className="whitespace-pre-wrap text-body-sm text-fg">{ruling.justification}</p>
      {ruling.sanctionNote ? (
        <>
          <h3 className="label-caps mt-2 text-fg-muted">{disputeCopy.ruling.sanction}</h3>
          <p className="text-body-sm text-fg">{ruling.sanctionNote}</p>
        </>
      ) : null}
    </section>
  );
}

function EvidenceSheet({
  matchId,
  dispute,
  onClose,
  onDone,
}: {
  matchId: string;
  dispute: DisputeView;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const noteId = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = useProofUpload(matchId, 'dispute_evidence');
  const ready = upload.state.status === 'ready';
  const uploading = ['compressing', 'uploading', 'processing'].includes(upload.state.status);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await disputesApi.addEvidence(dispute.id, {
        uploadId: upload.state.status === 'ready' ? upload.state.uploadId : undefined,
        note: note.trim() || undefined,
      });
      toast({ title: disputeCopy.panel.evidenceAdded, variant: 'status' });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the evidence');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={disputeCopy.panel.addEvidence}
      footer={
        <Button
          fullWidth
          loading={busy}
          disabled={uploading || (!ready && !note.trim())}
          hint={uploading ? resultCopy.waitForUpload : undefined}
          onClick={submit}
        >
          {disputeCopy.panel.addEvidence}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-caption text-fg-muted">
          {disputeCopy.panel.evidenceLeft(dispute.evidenceRemaining)}
        </p>
        {error ? <p className="text-body-sm text-loss">{error}</p> : null}
        <ProofUpload
          label="Screenshot"
          help="Anything that shows what happened: the final score, a disconnect, a message."
          state={upload.state}
          copy={resultCopy.upload}
          onPick={upload.pick}
          onRetry={upload.retry}
          onRemove={upload.remove}
        />
        <div>
          <label htmlFor={noteId} className="mb-1 block text-body-sm text-fg">
            {disputeCopy.panel.evidenceNote}
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            className="block w-full rounded-control border border-line bg-raised px-3 py-2.5 text-body text-fg focus:border-accent focus:outline-none"
          />
        </div>
      </div>
    </Sheet>
  );
}

function AppealSheet({
  dispute,
  onClose,
  onDone,
}: {
  dispute: DisputeView;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooShort = reason.trim().length < 10;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await disputesApi.appeal(dispute.id, reason.trim());
      toast({ title: disputeCopy.appeal.sent, variant: 'status' });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the appeal');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={disputeCopy.appeal.title}
      footer={
        <div className="flex flex-col gap-2">
          <Button
            fullWidth
            loading={busy}
            disabled={tooShort}
            hint={tooShort ? 'At least 10 characters.' : undefined}
            onClick={submit}
          >
            {disputeCopy.appeal.submit}
          </Button>
          <Button fullWidth variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-body-sm text-fg-muted">{disputeCopy.appeal.intro}</p>
        {error ? <p className="text-body-sm text-loss">{error}</p> : null}
        <label htmlFor={reasonId} className="block text-body-sm text-fg">
          {disputeCopy.appeal.reason}
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={1000}
          className="block w-full rounded-control border border-line bg-raised px-3 py-2.5 text-body text-fg focus:border-accent focus:outline-none"
        />
      </div>
    </Sheet>
  );
}
