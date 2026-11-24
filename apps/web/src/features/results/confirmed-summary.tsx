'use client';

import { useEffect, useState } from 'react';
import type { MatchDetail } from '@raise/api-client';
import { Button, CountUp, Icon, RankTierBadge, StatusChip } from '@/components/ui';
import { cn } from '@/lib/cn';
import { resultCopy } from '@/lib/copy/results';
import { TIER_LEVEL, outcomeTag } from '@/lib/match-status';

/**
 * Confirmed summary (UX Flow 5, Design §5 signature moment): rating counts up
 * over 240–400ms (instant under reduced motion), rank tier, record, and the
 * Win/Loss tag. The rating change itself comes from Sprint 10's rating events;
 * until then `ratingDelta` is null and the current rating shows without motion.
 */
export function ConfirmedSummary({ match, onDone }: { match: MatchDetail; onDone?: () => void }) {
  const tag = outcomeTag(match);
  const delta = match.ratingDelta;
  const target = match.me.rating;
  const [shown, setShown] = useState(delta === null ? target : target - delta);
  useEffect(() => {
    // Start from the pre-match rating, then count to the new one.
    const t = window.setTimeout(() => setShown(target), 50);
    return () => window.clearTimeout(t);
  }, [target]);

  const won = match.outcomeForViewer === 'win';
  const title =
    match.status === 'forfeited'
      ? won
        ? resultCopy.confirmed.forfeited
        : resultCopy.confirmed.youForfeited
      : resultCopy.confirmed.title;
  const score = match.me.submission?.score ?? mirrored(match.opponent.submission?.score ?? null);

  return (
    <section
      aria-labelledby="summary-title"
      className={cn(
        'flex flex-col items-center gap-4 rounded-card border bg-surface p-6 text-center',
        // Glow is reserved for the rank badge and the win-confirmed state (Design §4).
        won ? 'border-win/50 shadow-glow' : 'border-line',
      )}
    >
      <Icon name="check-circle" size={32} className={won ? 'text-win' : 'text-fg-muted'} />
      <div className="flex flex-col items-center gap-2">
        <h2 id="summary-title" className="font-display text-mk-h1 uppercase text-fg text-balance">
          {title}
        </h2>
        {tag ? <StatusChip label={tag.label} variant={tag.variant} icon={tag.icon} /> : null}
      </div>

      {score ? (
        <p
          className="font-display text-stat-lg font-semibold text-fg tabular"
          aria-label={`Score ${score.self} to ${score.opponent}`}
        >
          {score.self} – {score.opponent}
        </p>
      ) : null}

      <dl className="grid w-full max-w-xs grid-cols-3 gap-4 border-t border-line pt-4">
        <div className="flex flex-col items-center gap-1">
          <dt className="label-caps text-fg-muted">{resultCopy.confirmed.rating}</dt>
          <dd className="flex flex-col items-center">
            <CountUp value={shown} className="font-display text-stat-lg font-semibold text-fg" />
            {delta !== null ? (
              <span className={cn('text-caption tabular', delta >= 0 ? 'text-win' : 'text-loss')}>
                {delta >= 0 ? '+' : '−'}
                {Math.abs(delta)}
              </span>
            ) : (
              <span className="text-caption text-fg-muted">
                {resultCopy.confirmed.ratingPending}
              </span>
            )}
          </dd>
        </div>
        <div className="flex flex-col items-center gap-1">
          <dt className="label-caps text-fg-muted">{resultCopy.confirmed.rank}</dt>
          <dd>
            <RankTierBadge tier={TIER_LEVEL[match.me.rankTier] ?? 1} label={match.me.rankLabel} />
          </dd>
        </div>
        <div className="flex flex-col items-center gap-1">
          <dt className="label-caps text-fg-muted">{resultCopy.confirmed.record}</dt>
          <dd className="font-display text-stat-md font-semibold text-fg tabular">
            {match.me.wins}–{match.me.losses}
          </dd>
        </div>
      </dl>

      {match.decidedVia === 'auto_timeout' ? (
        <p className="text-body-sm text-fg-muted">{resultCopy.confirmed.viaTimeout}</p>
      ) : null}

      {onDone ? (
        <Button size="lg" fullWidth onClick={onDone}>
          {resultCopy.confirmed.done}
        </Button>
      ) : null}
    </section>
  );
}

function mirrored(score: { self: number; opponent: number } | null) {
  return score ? { self: score.opponent, opponent: score.self } : null;
}
