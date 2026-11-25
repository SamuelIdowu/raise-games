'use client';

import { useState } from 'react';
import {
  challengesApi,
  isParticipantView,
  type ChallengeCard,
  type MatchView,
} from '@raise/api-client';
import {
  Avatar,
  Button,
  ButtonLink,
  RatingBadge,
  Skeleton,
  StatusChip,
  useToast,
} from '@/components/ui';
import { useGame } from '@/components/shell/GameProvider';
import { useLeaderboard, useMatches, useMyOpenChallenges } from '@/lib/app-data';
import { formatDuration, formatTimeWindow } from '@/lib/time';
import { matchChip } from '@/lib/match-status';
import { useNow } from '@/lib/use-now';
import { refresh } from '@/lib/use-api';
import { RailCard } from './AppPage';

/** What the viewer should do in a match, as a button label. */
export function nextActionLabel(m: MatchView): string {
  switch (m.nextAction) {
    case 'submit_result':
      return 'Submit result';
    case 'confirm_or_submit':
      return 'Confirm result';
    case 'wait_for_start':
      return 'Open match room';
    case 'waiting_for_opponent':
      return 'View match';
    case 'disputed':
      return 'View dispute';
    default:
      return 'View match';
  }
}

/** Matches the viewer must act on first, then the soonest to start. */
export function sortByUrgency(items: MatchView[]): MatchView[] {
  const weight = (m: MatchView) =>
    m.nextAction === 'confirm_or_submit' ? 0 : m.nextAction === 'submit_result' ? 1 : 2;
  return [...items].sort(
    (a, b) =>
      weight(a) - weight(b) ||
      new Date(a.agreedStartAt ?? a.timeWindow.startsAt).getTime() -
        new Date(b.agreedStartAt ?? b.timeWindow.startsAt).getTime(),
  );
}

/** Countdown line for a match: to start, to the result deadline, or to confirmation. */
function useMatchClock(m: MatchView) {
  const now = useNow(30_000);
  const start = new Date(m.agreedStartAt ?? m.timeWindow.startsAt).getTime();
  if (m.nextAction === 'wait_for_start' && start > now) {
    return { label: 'Starts in', value: formatDuration(start - now) ?? 'now' };
  }
  if (m.deadline) {
    const left = formatDuration(new Date(m.deadline.at).getTime() - now);
    return {
      label: m.deadline.kind === 'confirm_result' ? 'Confirm within' : 'Submit within',
      value: left ?? 'deadline passed',
    };
  }
  return null;
}

/** The headline "next match" block: opponent, clock and one primary action. */
export function NextMatchCard({ match, compact = false }: { match: MatchView; compact?: boolean }) {
  const clock = useMatchClock(match);
  const chip = matchChip(match);
  const opponent = match.opponent;
  const mustAct = match.nextAction === 'submit_result' || match.nextAction === 'confirm_or_submit';

  return (
    <article
      className={
        compact
          ? 'space-y-4'
          : 'surface-card space-y-5 rounded-card border-accent p-5 shadow-hard-sm [--hard-ink:var(--accent-ink)] md:p-6'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display text-[12px] font-bold uppercase tracking-[0.06em] text-fg">
          {match.game.name} <span className="text-fg-subtle">· {match.format.name}</span>
        </span>
        <StatusChip label={chip.label} variant={chip.variant} icon={chip.icon} />
      </div>

      {opponent ? (
        <div className="flex items-center gap-3">
          <Avatar username={opponent.username} size={compact ? 32 : 64} />
          <div className="min-w-0 flex-1">
            <p className="label-caps text-fg-subtle">Opponent</p>
            <p className="truncate font-display text-[15px] font-bold text-fg">
              {opponent.username}
            </p>
          </div>
          <RatingBadge value={opponent.rating} provisional={opponent.provisional} />
        </div>
      ) : null}

      {clock ? (
        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-4">
          <span className="label-caps text-fg-subtle">{clock.label}</span>
          <span
            className={`font-display text-[20px] font-black tabular ${mustAct ? 'text-accent' : 'text-fg'}`}
          >
            {clock.value}
          </span>
        </div>
      ) : null}

      <ButtonLink
        href={`/matches/${match.id}`}
        variant={mustAct ? 'primary' : 'secondary'}
        fullWidth
        arrow
      >
        {nextActionLabel(match)}
      </ButtonLink>
    </article>
  );
}

/** Rail: the most urgent active match, or a nudge to find one. */
export function NextMatchRail() {
  const { data, loading } = useMatches('active');
  const items = sortByUrgency((data?.items ?? []).filter(isParticipantView));
  const first = items[0];

  return (
    <RailCard
      title={items.length > 1 ? `Next match · ${items.length} active` : 'Next match'}
      href={items.length > 1 ? '/matches' : undefined}
    >
      {loading ? (
        <Skeleton className="h-40" />
      ) : first ? (
        <NextMatchCard match={first} compact />
      ) : (
        <div className="space-y-3">
          <p className="text-body-sm text-fg-muted">
            No match in progress. Accept an open challenge or post your own.
          </p>
          <ButtonLink href="/play" fullWidth arrow>
            Find a challenge
          </ButtonLink>
        </div>
      )}
    </RailCard>
  );
}

/** Rail: my rank on the current game's ladder, with the players just above and below. */
export function RankRail() {
  const { currentGame, games } = useGame();
  const gameName = games.find((g) => g.id === currentGame)?.label ?? currentGame;
  const { data, loading } = useLeaderboard(currentGame);
  const me = data?.me ?? null;

  const around = me
    ? (data?.items ?? []).filter((row) => Math.abs(row.rank - me.rank) <= 1).slice(0, 3)
    : [];

  return (
    <RailCard title={`${gameName} rank`} href="/leaderboard" linkLabel="Leaderboard">
      {loading ? (
        <Skeleton className="h-28" />
      ) : me ? (
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="label-caps text-fg-subtle">Rank</p>
              <p className="font-display text-[40px] font-black leading-none text-fg tabular">
                #{me.rank}
              </p>
            </div>
            <div className="text-right">
              <p className="label-caps text-fg-subtle">Rating</p>
              <p className="font-display text-[22px] font-black text-accent tabular">
                {me.rating.toLocaleString()}
              </p>
              {me.trend.delta !== 0 ? (
                <p className="text-caption text-fg-subtle tabular">
                  {me.trend.direction === 'up' ? '▲' : '▼'} {Math.abs(me.trend.delta)} this week
                </p>
              ) : null}
            </div>
          </div>
          {around.length > 1 ? (
            <ol className="divide-y divide-line border-t border-line">
              {around.map((row) => (
                <li
                  key={row.userId}
                  className={`flex items-center gap-3 py-2 text-body-sm ${row.userId === me.userId ? 'text-accent' : 'text-fg-muted'}`}
                >
                  <span className="w-8 font-display font-bold tabular">#{row.rank}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {row.userId === me.userId ? 'You' : row.username}
                  </span>
                  <span className="tabular">{row.rating}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : (
        <p className="text-body-sm text-fg-muted">
          Not ranked in {gameName} yet. Your first confirmed match puts you on the ladder.
        </p>
      )}
    </RailCard>
  );
}

/** One of my own open challenges, with cancel. */
function MyChallengeRow({ challenge }: { challenge: ChallengeCard }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const cancel = async () => {
    setBusy(true);
    try {
      await challengesApi.cancel(challenge.id);
      refresh('challenges');
      toast({ variant: 'status', title: 'Challenge cancelled' });
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Could not cancel',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-semibold text-fg">
          {challenge.target ? `vs ${challenge.target.username}` : challenge.format.name}
        </p>
        <p className="truncate text-caption text-fg-subtle">
          {formatTimeWindow(challenge.timeWindow.startsAt, challenge.timeWindow.endsAt)}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={cancel} disabled={busy}>
        Cancel
      </Button>
    </li>
  );
}

/** Rail: my open challenges for the current game, plus create. */
export function MyChallengesRail() {
  const { currentGame } = useGame();
  const { data, loading } = useMyOpenChallenges(currentGame);
  const items = data?.items ?? [];

  return (
    <RailCard title="Your open challenges">
      {loading ? (
        <Skeleton className="h-20" />
      ) : items.length > 0 ? (
        <ul className="-my-3 divide-y divide-line">
          {items.slice(0, 4).map((c) => (
            <MyChallengeRow key={c.id} challenge={c} />
          ))}
        </ul>
      ) : (
        <p className="text-body-sm text-fg-muted">
          None open. Post one and it shows on the board straight away.
        </p>
      )}
      <ButtonLink href="/play?create=1" variant="secondary" fullWidth arrow>
        Create challenge
      </ButtonLink>
    </RailCard>
  );
}

/** Rail: quick explainer of the match loop, for players with no history. */
export function HowItWorksRail() {
  const steps = [
    ['Accept or post', 'Pick a challenge on the board, or post your own.'],
    ['Play in game', 'Agree the room in chat, then play at the agreed time.'],
    ['Report with proof', 'Both submit the score and a screenshot.'],
    ['Climb', 'Confirmed results move your rating.'],
  ] as const;
  return (
    <RailCard title="How a match works" href="/community-rules" linkLabel="Rules">
      <ol className="space-y-3">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="font-display text-[12px] font-bold italic text-accent tabular">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div>
              <p className="text-body-sm font-semibold text-fg">{title}</p>
              <p className="text-caption text-fg-subtle">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </RailCard>
  );
}

/** The default rail for app pages. */
export function DefaultRail({ hide = [] }: { hide?: Array<'next' | 'rank' | 'mine' | 'how'> }) {
  return (
    <>
      {!hide.includes('next') && <NextMatchRail />}
      {!hide.includes('rank') && <RankRail />}
      {!hide.includes('mine') && <MyChallengesRail />}
      {!hide.includes('how') && <HowItWorksRail />}
    </>
  );
}
