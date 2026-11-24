'use client';

import type { ChallengeCard as ChallengeCardData } from '@raise/api-client';
import { Avatar, Button, Icon, RatingBadge, ReputationBadge, StatusChip } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDuration, formatTimeWindow } from '@/lib/time';

export function isChallengeExpired(
  c: Pick<ChallengeCardData, 'status' | 'expiresAt'>,
  now: number,
) {
  return c.status === 'expired' || (c.status === 'open' && new Date(c.expiresAt).getTime() <= now);
}

/**
 * Challenge card (Design §8). Rows: game + format chip | stake slot; poster; a reserved
 * Stage 2 rating-gap slot (collapsed, so the layout does not move later); time window
 * and expiry; actions. States: default, expired (muted, Accept disabled with a reason),
 * mine ("Your challenge", Cancel replaces Accept), for me (direct challenge: Accept +
 * Decline), pending (the action in flight shows a spinner).
 */
export function ChallengeCard({
  challenge,
  pending,
  onAccept,
  onDecline,
  onCancel,
  onDetails,
  now,
}: {
  challenge: ChallengeCardData;
  pending: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
  onDetails: () => void;
  /** From useNow() in the parent, so every card ticks together. */
  now: number;
}) {
  const { game, format, stake, poster, timeWindow, expiresAt, isMine, isForMe, status } = challenge;
  const expired = isChallengeExpired(challenge, now);
  const closed = status !== 'open';
  const left = formatDuration(new Date(expiresAt).getTime() - now);

  const isDirect = isForMe && !isMine;

  return (
    <article
      aria-label={`${game.name} challenge from ${poster.username}`}
      className={cn(
        'rounded-card border bg-surface p-4 transition-colors duration-[var(--motion-default)] ease-standard',
        expired || closed
          ? 'border-line opacity-60'
          : isDirect
            ? 'border-accent/60'
            : isMine
              ? 'border-accent/40'
              : 'border-line hover:border-line-strong active:bg-overlay',
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-display text-h3 font-black uppercase text-fg">{game.name}</span>
          <StatusChip label={format.name} variant="neutral" />
          {isMine ? <StatusChip label="Your challenge" variant="accent" icon="user" /> : null}
          {isForMe ? <StatusChip label="Challenged you" variant="accent" icon="flag" /> : null}
        </div>
        <p className="shrink-0 font-display text-h3 font-black uppercase text-accent tabular">
          {stake.display}
        </p>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <Avatar username={poster.username} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-body font-semibold text-fg">{poster.username}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RatingBadge value={poster.rating} provisional={poster.provisional} />
            <span className="text-caption text-fg-muted tabular">{poster.record}</span>
            <ReputationBadge level={poster.reputation} />
          </div>
        </div>
      </div>

      {/* Reserved for the Stage 2 rating-gap indicator; collapsed in Stage 1 (Design §8). */}
      <div data-slot="rating-gap" hidden />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-caption">
        <span className="flex items-center gap-1 text-fg-muted">
          <Icon name="clock" size={14} aria-hidden />
          {formatTimeWindow(timeWindow.startsAt, timeWindow.endsAt)}
        </span>
        <span className={expired ? 'text-fg-muted' : 'text-fg'}>
          {closed ? statusLabel(status) : expired ? 'Expired' : `Expires in ${left}`}
        </span>
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onDetails} className="flex-1">
          Details
        </Button>
        {isMine ? (
          status === 'open' || status === 'accepted' ? (
            <Button variant="secondary" className="flex-[2]" onClick={onCancel} loading={pending}>
              Cancel challenge
            </Button>
          ) : null
        ) : expired || closed ? (
          <Button
            className="flex-[2]"
            disabled
            hint={expired ? 'This challenge is past its 48-hour window' : 'No longer open'}
          >
            Accept
          </Button>
        ) : (
          <>
            {isForMe ? (
              <Button variant="secondary" className="flex-1" onClick={onDecline} disabled={pending}>
                Decline
              </Button>
            ) : null}
            <Button className="flex-[2]" onClick={onAccept} loading={pending}>
              Accept
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

function statusLabel(status: string): string {
  return status === 'accepted' ? 'Accepted' : status.charAt(0).toUpperCase() + status.slice(1);
}
