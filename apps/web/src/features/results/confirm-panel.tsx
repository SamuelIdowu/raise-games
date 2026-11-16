'use client';

import { useState } from 'react';
import { SCORE_BOUNDS } from '@raise/game-configs/results';
import { matchesApi, type MatchDetail } from '@raise/api-client';
import { Banner, Button } from '@/components/ui';
import { resultCopy } from '@/lib/copy/results';
import { formatDateTime, formatRelative } from '@/lib/datetime';
import { track } from '@/lib/analytics';
import { ProofThumbnail } from './proof-thumbnail';

/**
 * Opponent submitted first (UX Flow 5 "opponent confirm or dispute"). Confirm is
 * the primary action; submitting a different result is the honest alternative
 * and opens a dispute automatically if it conflicts (Sprint 9 builds the
 * explicit dispute form).
 */
export function ConfirmPanel({
  match,
  onConfirmed,
  onSubmitDifferent,
}: {
  match: MatchDetail;
  onConfirmed: () => void;
  onSubmitDifferent: () => void;
}) {
  const claim = match.opponent.submission!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const isNoShow = claim.kind === 'no_show';
  const unit = SCORE_BOUNDS[match.format.resultSchema.scoreModel].label;

  // Claim is stored from the opponent's point of view; show it from the viewer's.
  const theirOutcome =
    claim.outcome === 'win'
      ? 'They won'
      : claim.outcome === 'loss'
        ? 'You won'
        : claim.outcome === 'draw'
          ? 'Draw'
          : '';

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await matchesApi.confirm(match.id, idempotencyKey);
      track('result_confirmed', { side: match.me.side, game: match.game.key, no_show: isNoShow });
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : resultCopy.submitFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="confirm-title"
      className="flex flex-col gap-4 rounded-card border border-accent/40 bg-surface p-4"
    >
      <h2 id="confirm-title" className="font-display text-h2 font-semibold text-fg">
        {resultCopy.confirm.title}
      </h2>

      <div className="flex items-start gap-3">
        {claim.uploadId ? (
          <ProofThumbnail uploadId={claim.uploadId} label="Open your opponent's screenshot" />
        ) : null}
        <div className="flex flex-col gap-2">
          {isNoShow ? (
            <p className="text-body text-fg">{resultCopy.confirm.noShowClaim}</p>
          ) : (
            <>
              <p className="text-body text-fg">{resultCopy.confirm.claimed(theirOutcome)}</p>
              {claim.score ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <dt className="text-caption text-fg-muted">
                    {resultCopy.you} · {unit}
                  </dt>
                  <dt className="text-caption text-fg-muted">
                    {resultCopy.opponent} · {unit}
                  </dt>
                  <dd className="font-display text-stat-md font-semibold text-fg tabular">
                    {claim.score.opponent}
                  </dd>
                  <dd className="font-display text-stat-md font-semibold text-fg tabular">
                    {claim.score.self}
                  </dd>
                </dl>
              ) : null}
            </>
          )}
          {claim.note ? <p className="text-body-sm text-fg-muted">“{claim.note}”</p> : null}
        </div>
      </div>

      {match.confirmationDeadline ? (
        <p className="text-body-sm text-fg-muted">
          {resultCopy.confirm.deadline}{' '}
          <time
            dateTime={match.confirmationDeadline}
            title={formatDateTime(match.confirmationDeadline)}
          >
            {formatDateTime(match.confirmationDeadline)}
          </time>{' '}
          ({formatRelative(match.confirmationDeadline)})
        </p>
      ) : null}

      {error ? (
        <div role="alert">
          <Banner variant="system" className="border-loss/50">
            {error}
          </Banner>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" fullWidth loading={busy} onClick={confirm}>
          {isNoShow ? resultCopy.confirm.concede : resultCopy.confirm.confirmCta}
        </Button>
        <Button size="lg" variant="secondary" fullWidth onClick={onSubmitDifferent} disabled={busy}>
          {resultCopy.confirm.disagree}
        </Button>
      </div>
    </section>
  );
}
