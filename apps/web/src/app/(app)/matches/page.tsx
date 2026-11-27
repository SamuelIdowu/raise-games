'use client';

import { useState } from 'react';
import Link from 'next/link';
import { isParticipantView, type MatchDetail } from '@raise/api-client';
import {
  Avatar,
  Banner,
  Button,
  ButtonLink,
  EmptyState,
  PageHeader,
  RatingBadge,
  SkeletonCard,
  StatusChip,
  Tabs,
  tabPanelProps,
} from '@/components/ui';
import { AppPage, SectionHeading } from '@/components/app/AppPage';
import {
  MyChallengesRail,
  RankRail,
  nextActionLabel,
  sortByUrgency,
} from '@/components/app/widgets';
import { useChallengeActions } from '@/components/app/use-challenge-actions';
import { useChallengesForMe, useMatches } from '@/lib/app-data';
import { formatRelative } from '@/lib/datetime';
import { TERMINAL, matchChip, outcomeTag } from '@/lib/match-status';
import { formatAbsolute, formatDuration } from '@/lib/time';
import { useNow } from '@/lib/use-now';

type TabKey = 'action' | 'active' | 'history';

const mustAct = (m: MatchDetail) =>
  m.nextAction === 'submit_result' || m.nextAction === 'confirm_or_submit';

/**
 * Matches (UX Flows 4–6): what needs me, what is in progress, and what is settled. Each
 * row says when, what's next, and for finished matches, how my rating moved.
 */
export default function MatchesPage() {
  const all = useMatches('all');
  const forMe = useChallengesForMe();
  const actions = useChallengeActions();
  const now = useNow();

  const items = (all.data?.items ?? []).filter(isParticipantView);
  const needs = sortByUrgency(items.filter(mustAct)) as MatchDetail[];
  const active = sortByUrgency(
    items.filter((m) => !TERMINAL.has(m.status) && !mustAct(m)),
  ) as MatchDetail[];
  const history = items
    .filter((m) => TERMINAL.has(m.status))
    .sort(
      (a, b) =>
        new Date(b.completedAt ?? b.acceptedAt).getTime() -
        new Date(a.completedAt ?? a.acceptedAt).getTime(),
    );

  const [tab, setTab] = useState<TabKey | null>(null);
  // Open on the tab that matters: needs-you if anything does, else active, else history.
  const current: TabKey =
    tab ?? (needs.length > 0 ? 'action' : active.length > 0 ? 'active' : 'history');
  const list = current === 'action' ? needs : current === 'active' ? active : history;
  const incoming = forMe.data?.items ?? [];

  const record = history.reduce(
    (acc, m) => {
      if (m.outcomeForViewer === 'win') acc.w++;
      else if (m.outcomeForViewer === 'loss') acc.l++;
      else if (m.outcomeForViewer === 'draw') acc.d++;
      return acc;
    },
    { w: 0, l: 0, d: 0 },
  );

  return (
    <AppPage
      header={
        <PageHeader
          eyebrow="Your games"
          title="Matches"
          subtitle={
            history.length > 0
              ? `${history.length} played · ${record.w}W ${record.l}L ${record.d}D across all games`
              : undefined
          }
          action={
            <ButtonLink href="/play" arrow>
              Find a challenge
            </ButtonLink>
          }
        />
      }
      rail={
        <>
          <MyChallengesRail />
          <RankRail />
        </>
      }
    >
      {incoming.length > 0 ? (
        <section aria-labelledby="incoming" className="space-y-3">
          <SectionHeading id="incoming" href="/play" linkLabel="Board">
            Challenges sent to you · {incoming.length}
          </SectionHeading>
          <ul className="surface-card divide-y divide-line rounded-card">
            {incoming.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
                <Avatar username={c.poster.username} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-semibold text-fg">{c.poster.username}</p>
                  <p className="truncate text-caption text-fg-subtle">
                    {c.game.name} · {c.format.name}
                  </p>
                  <p className="text-caption text-fg-subtle">
                    {formatAbsolute(c.timeWindow.startsAt)} · expires{' '}
                    {formatRelative(c.expiresAt, now)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={actions.pendingId === c.id}
                    onClick={() => void actions.decline(c)}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    loading={actions.pendingId === c.id}
                    onClick={() => void actions.accept(c)}
                  >
                    Accept
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Tabs<TabKey>
        idPrefix="matches"
        aria-label="Match lists"
        value={current}
        onChange={setTab}
        items={[
          { key: 'action', label: 'Needs you', count: needs.length },
          { key: 'active', label: 'In progress', count: active.length },
          { key: 'history', label: 'History', count: history.length },
        ]}
      />

      <div {...tabPanelProps('matches', current)}>
        {all.error && !all.data ? (
          <Banner variant="system" action={<Button onClick={all.reload}>Retry</Button>}>
            {all.error}
          </Banner>
        ) : all.loading ? (
          <div className="space-y-3" aria-busy="true">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            pixel={current === 'action' ? 'star' : current === 'active' ? 'gamepad' : 'crown'}
            tone={current === 'action' ? 'brand' : 'accent'}
            eyebrow={current === 'action' ? 'All clear' : 'Nothing here yet'}
            title={
              current === 'action'
                ? 'Nothing needs you'
                : current === 'active'
                  ? 'No matches in progress'
                  : 'No finished matches yet'
            }
            description={
              current === 'action'
                ? 'No results to submit or confirm. When a match needs your report, it shows up here first.'
                : current === 'active'
                  ? 'Accept an open challenge or post your own. The match room opens the moment someone accepts.'
                  : 'Every confirmed result lands here with the score and how your rating moved.'
            }
            steps={
              current === 'action'
                ? undefined
                : [
                    'Pick a challenge or post one',
                    'Play at the agreed time',
                    'Both report with a screenshot',
                  ]
            }
            action={
              <ButtonLink href="/play" arrow>
                Find a challenge
              </ButtonLink>
            }
            secondaryAction={
              current === 'action' ? undefined : (
                <ButtonLink href="/play?create=1" variant="secondary">
                  Post a challenge
                </ButtonLink>
              )
            }
          />
        ) : (
          <ul className="space-y-3">
            {list.map((m) => (
              <MatchRow key={m.id} match={m} now={now} />
            ))}
          </ul>
        )}
      </div>
    </AppPage>
  );
}

function MatchRow({ match, now }: { match: MatchDetail; now: number }) {
  const chip = matchChip(match);
  const tag = outcomeTag(match);
  const finished = TERMINAL.has(match.status);
  const act = mustAct(match);
  const start = new Date(match.agreedStartAt ?? match.timeWindow.startsAt).getTime();

  let when: string;
  if (finished) {
    when = match.completedAt ? `Finished ${formatRelative(match.completedAt, now)}` : 'Finished';
  } else if (match.nextAction === 'wait_for_start' && start > now) {
    when = `Starts in ${formatDuration(start - now)}`;
  } else if (match.deadline) {
    const left = formatDuration(new Date(match.deadline.at).getTime() - now);
    when = left
      ? `${match.deadline.kind === 'confirm_result' ? 'Confirm' : 'Submit'} within ${left}`
      : 'Deadline passed';
  } else {
    when = formatAbsolute(match.timeWindow.startsAt);
  }

  return (
    <li>
      <Link
        href={`/matches/${match.id}`}
        className={`surface-card grid grid-cols-[minmax(0,1fr)] gap-4 rounded-card p-4 transition-[transform,border-color] hover:-translate-y-0.5 hover:border-line-strong md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-5 ${act ? 'border-accent' : ''}`}
      >
        <div className="flex min-w-0 items-center gap-4">
          <Avatar username={match.opponent.username} size={64} />
          <div className="min-w-0 space-y-1">
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
              {match.game.name} · {match.format.name}
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="min-w-0 truncate font-display text-[17px] font-bold text-fg">
                vs {match.opponent.username}
              </p>
              <RatingBadge value={match.opponent.rating} provisional={match.opponent.provisional} />
            </div>
            <p className={`text-caption ${act ? 'font-semibold text-accent' : 'text-fg-subtle'}`}>
              {when}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 md:justify-end">
          {tag ? <StatusChip label={tag.label} variant={tag.variant} icon={tag.icon} /> : null}
          <StatusChip label={chip.label} variant={chip.variant} icon={chip.icon} />
          {finished && match.ratingDelta !== null ? (
            <span
              className={`font-display text-[18px] font-black tabular ${match.ratingDelta >= 0 ? 'text-success' : 'text-danger'}`}
            >
              {match.ratingDelta >= 0 ? `+${match.ratingDelta}` : match.ratingDelta}
            </span>
          ) : (
            <span
              className={`font-display text-[11px] font-bold uppercase tracking-[0.08em] ${act ? 'text-accent' : 'text-fg-subtle'}`}
            >
              {nextActionLabel(match)} →
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
