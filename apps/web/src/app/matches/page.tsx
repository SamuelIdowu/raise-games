'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { matchesApi, type MatchDetail, isParticipantView } from '@raise/api-client';
import {
  Avatar,
  Banner,
  Button,
  EmptyState,
  RatingBadge,
  SkeletonCard,
  StatusChip,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/datetime';
import { matchChip, outcomeTag } from '@/lib/match-status';

const POLL_MS = 20_000;

export default function MatchesPage() {
  const [items, setItems] = useState<MatchDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await matchesApi.list('all');
        if (live) {
          setItems(res.items.filter(isParticipantView));
          setError(null);
        }
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Could not load your matches.');
      }
    };
    void load();
    const id = window.setInterval(
      () => document.visibilityState === 'visible' && void load(),
      POLL_MS,
    );
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, []);

  const needsAction =
    items?.filter(
      (m) => m.nextAction === 'submit_result' || m.nextAction === 'confirm_or_submit',
    ) ?? [];

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <h1 className="font-display text-h1 font-semibold text-fg">Matches</h1>

      {needsAction.length > 0 ? (
        <Banner variant="needs-action">
          {needsAction.length === 1
            ? '1 match needs your action.'
            : `${needsAction.length} matches need your action.`}
        </Banner>
      ) : null}

      {error && !items ? <Banner variant="system">{error}</Banner> : null}

      {!items && !error ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}

      {items && items.length === 0 ? (
        <EmptyState
          icon="trophy"
          title="No matches yet"
          description="Accept a challenge or post your own to start playing."
          action={
            <Link href="/play">
              <Button>Find a challenge</Button>
            </Link>
          }
        />
      ) : null}

      {items && items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {items.map((match) => (
            <li key={match.id}>
              <MatchRow match={match} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function MatchRow({ match }: { match: MatchDetail }) {
  const chip = matchChip(match);
  const tag = outcomeTag(match);
  const mustAct = match.nextAction === 'submit_result' || match.nextAction === 'confirm_or_submit';
  const deadline =
    match.nextAction === 'confirm_or_submit' || match.nextAction === 'waiting_for_opponent'
      ? match.confirmationDeadline
      : match.nextAction === 'submit_result'
        ? match.resultDeadline
        : null;

  return (
    <Link
      href={`/matches/${match.id}`}
      className={cn(
        'flex flex-col gap-3 rounded-card border bg-surface p-4 transition-colors duration-[var(--motion-default)] ease-standard',
        mustAct ? 'border-accent' : 'border-line hover:border-line-strong',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display text-h3 font-semibold text-fg">
          {match.game.name} <span className="text-fg-muted">· {match.format.name}</span>
        </span>
        <div className="flex items-center gap-2">
          {tag ? <StatusChip label={tag.label} variant={tag.variant} icon={tag.icon} /> : null}
          <StatusChip label={chip.label} variant={chip.variant} icon={chip.icon} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Avatar username={match.opponent.username} size={32} />
        <span className="min-w-0 flex-1 truncate text-body text-fg">{match.opponent.username}</span>
        <RatingBadge value={match.opponent.rating} provisional={match.opponent.provisional} />
      </div>
      {deadline ? (
        <p className="text-caption text-fg-muted">
          Deadline <time dateTime={deadline}>{formatRelative(deadline)}</time>
        </p>
      ) : null}
    </Link>
  );
}
