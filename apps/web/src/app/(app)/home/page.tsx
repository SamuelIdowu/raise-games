'use client';

import { useState } from 'react';
import Link from 'next/link';
import { isParticipantView, type MatchView } from '@raise/api-client';
import {
  Avatar,
  Banner,
  Button,
  ButtonLink,
  EmptyState,
  PageHeader,
  PromoBanner,
  SkeletonCard,
  StatCard,
  StatusChip,
} from '@/components/ui';
import { AppPage, SectionHeading } from '@/components/app/AppPage';
import { ChallengeCard } from '@/components/challenge/challenge-card';
import { ChallengeDetailSheet } from '@/components/challenge/challenge-detail-sheet';
import {
  HowItWorksRail,
  MyChallengesRail,
  NextMatchCard,
  sortByUrgency,
} from '@/components/app/widgets';
import { useChallengeActions } from '@/components/app/use-challenge-actions';
import { useGame } from '@/components/shell/GameProvider';
import {
  useBoard,
  useChallengesForMe,
  useLeaderboard,
  useMatches,
  useMyProfiles,
  useNotifications,
} from '@/lib/app-data';
import { formatRelative } from '@/lib/datetime';
import { outcomeTag } from '@/lib/match-status';
import { useNow } from '@/lib/use-now';

function streakLabel(streak: number) {
  if (streak > 0) return `W${streak}`;
  if (streak < 0) return `L${-streak}`;
  return '—';
}

/**
 * Signed-in dashboard (UX spec: Shell + Flows 2, 4, 5, 8). Answers, in order: what needs
 * me now, how am I doing in this game, what can I play next, what just happened.
 * Scoped to the game picked in the header.
 */
export default function HomePage() {
  const { currentGame, games } = useGame();
  const gameName = games.find((g) => g.id === currentGame)?.label ?? currentGame;
  const now = useNow();

  const profiles = useMyProfiles();
  const active = useMatches('active');
  const finished = useMatches('finished');
  const forMe = useChallengesForMe(currentGame);
  const board = useBoard({ game: currentGame, status: 'open', mine: 'false', limit: 6 });
  const ladder = useLeaderboard(currentGame);
  const notifications = useNotifications();
  const actions = useChallengeActions();
  const [detailId, setDetailId] = useState<string | null>(null);

  if (profiles.error && !profiles.data) {
    return (
      <Banner variant="offline" action={<Button onClick={profiles.reload}>Retry</Button>}>
        Could not load your dashboard. {profiles.error}
      </Banner>
    );
  }

  const profile = profiles.data?.find((p) => p.gameKey === currentGame);
  const displayName = profiles.data?.[0]?.displayName ?? 'Player';
  const activeMatches = sortByUrgency((active.data?.items ?? []).filter(isParticipantView));
  const recent = (finished.data?.items ?? [])
    .filter(isParticipantView)
    .filter((m) => m.game.key === currentGame)
    .slice(0, 5);
  const openBoard = (board.data?.items ?? []).filter((c) => !c.isMine).slice(0, 4);
  const directForMe = forMe.data?.items ?? [];
  const me = ladder.data?.me ?? null;
  const allChallenges = [...directForMe, ...openBoard];
  const detail = detailId ? allChallenges.find((c) => c.id === detailId) : undefined;

  const challengeCard = (c: (typeof allChallenges)[number]) => (
    <ChallengeCard
      key={c.id}
      challenge={c}
      pending={actions.pendingId === c.id}
      onAccept={() => void actions.accept(c)}
      onDecline={() => void actions.decline(c)}
      onCancel={() => setDetailId(c.id)}
      onDetails={() => setDetailId(c.id)}
      now={now}
    />
  );

  return (
    <AppPage
      header={
        <PageHeader
          eyebrow={`${gameName} dashboard`}
          title={`Welcome back, ${displayName}`}
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
          <HowItWorksRail />
        </>
      }
    >
      {/* Standing in the current game */}
      <section aria-label={`Your ${gameName} standing`}>
        {profiles.loading ? (
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonCard key={i} className="h-[120px]" />
            ))}
          </div>
        ) : profile ? (
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard
              label={profile.provisional ? 'Rating · provisional' : 'Rating'}
              value={profile.rating}
              icon="star"
              size="md"
            />
            <StatCard
              label="Rank"
              value={me ? `#${me.rank}` : '—'}
              icon="crown"
              tone="dark"
              size="md"
              delta={me ? undefined : 'Play a match to rank'}
            />
            <StatCard
              label="Record"
              value={`${profile.wins}-${profile.losses}-${profile.draws}`}
              icon="shield"
              tone="dark"
              size="md"
            />
            <StatCard
              label="Streak"
              value={streakLabel(profile.streak)}
              icon="flame"
              tone="dark"
              size="md"
            />
          </div>
        ) : (
          <EmptyState
            icon="gamepad-2"
            title={`You don't play ${gameName} yet`}
            description={`Add your ${gameName} ID so opponents can find you, or switch game in the header.`}
            action={
              <ButtonLink href="/onboarding/games" arrow>
                Add {gameName}
              </ButtonLink>
            }
          />
        )}
      </section>

      {/* Up next */}
      <section aria-labelledby="up-next" className="space-y-4">
        <SectionHeading
          id="up-next"
          href={activeMatches.length > 2 ? '/matches' : undefined}
          linkLabel={`All ${activeMatches.length} matches`}
        >
          Up next
        </SectionHeading>
        {active.loading ? (
          <SkeletonCard className="h-48" />
        ) : activeMatches.length > 0 ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
            {activeMatches.slice(0, 2).map((m) => (
              <NextMatchCard key={m.id} match={m} />
            ))}
            {activeMatches.length === 1 ? <MatchChecklist match={activeMatches[0]!} /> : null}
          </div>
        ) : (
          <PromoBanner
            eyebrow="Free to play"
            title={
              <>
                Post a challenge,
                <br />
                settle it fair
              </>
            }
            action={
              <ButtonLink href="/play?create=1" variant="white" arrow>
                Create challenge
              </ButtonLink>
            }
          >
            No match on right now. Pick a format and time, invite a player or open it to the board.
            Both players report, proof settles disputes.
          </PromoBanner>
        )}
      </section>

      {directForMe.length > 0 ? (
        <section aria-labelledby="for-you" className="space-y-4">
          <SectionHeading id="for-you">Challenges for you · {directForMe.length}</SectionHeading>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
            {directForMe.map(challengeCard)}
          </div>
        </section>
      ) : null}

      {/* What to play */}
      <section aria-labelledby="open-board" className="space-y-4">
        <SectionHeading id="open-board" href="/play" linkLabel="Open board">
          Open {gameName} challenges
        </SectionHeading>
        {board.loading ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
            <SkeletonCard className="h-44" />
            <SkeletonCard className="h-44" />
          </div>
        ) : openBoard.length > 0 ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
            {openBoard.map(challengeCard)}
          </div>
        ) : (
          <EmptyState
            icon="trophy"
            title={`No open ${gameName} challenges`}
            description="Be the first: post one and it shows on the board straight away."
            action={
              <ButtonLink href="/play?create=1" arrow>
                Create challenge
              </ButtonLink>
            }
          />
        )}
      </section>

      {/* What happened */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-2">
        <section aria-labelledby="recent-results" className="space-y-4">
          <SectionHeading id="recent-results" href="/matches" linkLabel="History">
            Recent results
          </SectionHeading>
          {finished.loading ? (
            <SkeletonCard className="h-40" />
          ) : recent.length > 0 ? (
            <ul className="surface-card divide-y divide-line rounded-card">
              {recent.map((m) => (
                <RecentResultRow key={m.id} match={m} />
              ))}
            </ul>
          ) : (
            <p className="surface-card rounded-card p-5 text-body-sm text-fg-muted">
              Confirmed results and rating changes show up here after your first match.
            </p>
          )}
        </section>

        <section aria-labelledby="activity" className="space-y-4">
          <SectionHeading id="activity" href="/inbox" linkLabel="Inbox">
            Activity
          </SectionHeading>
          {notifications.loading ? (
            <SkeletonCard className="h-40" />
          ) : (notifications.data?.items.length ?? 0) > 0 ? (
            <ul className="surface-card divide-y divide-line rounded-card">
              {notifications.data!.items.slice(0, 5).map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.link || '/inbox'}
                    className="flex items-start gap-3 p-4 transition-colors hover:bg-bg-subtle"
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? 'bg-line-strong' : 'bg-accent'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-semibold text-fg">
                        {n.title}
                      </span>
                      <span className="block truncate text-caption text-fg-subtle">{n.body}</span>
                    </span>
                    <time dateTime={n.createdAt} className="shrink-0 text-caption text-fg-subtle">
                      {formatRelative(n.createdAt, now)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="surface-card rounded-card p-5 text-body-sm text-fg-muted">
              Challenges, results and disputes that involve you show up here.
            </p>
          )}
        </section>
      </div>

      {detailId ? (
        <ChallengeDetailSheet
          challengeId={detailId}
          summary={detail}
          pending={actions.pendingId === detailId}
          onClose={() => setDetailId(null)}
          onAccept={() => detail && void actions.accept(detail)}
          onDecline={() => detail && void actions.decline(detail)}
          onCancel={async () => {
            if (detail) await actions.cancel(detail);
            setDetailId(null);
          }}
        />
      ) : null}
    </AppPage>
  );
}

function RecentResultRow({ match }: { match: MatchView }) {
  const tag = outcomeTag(match);
  const delta = match.ratingDelta;
  return (
    <li>
      <Link
        href={`/matches/${match.id}`}
        className="flex items-center gap-3 p-4 transition-colors hover:bg-bg-subtle"
      >
        <Avatar username={match.opponent?.username ?? '?'} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-semibold text-fg">
            vs {match.opponent?.username ?? 'Opponent'}
          </span>
          <span className="block truncate text-caption text-fg-subtle">
            {match.game.name}
            {match.confirmedAt ? ` · ${formatRelative(match.confirmedAt)}` : ''}
          </span>
        </span>
        {tag ? <StatusChip label={tag.label} variant={tag.variant} icon={tag.icon} /> : null}
        {delta !== null ? (
          <span
            className={`w-12 text-right font-display text-body-sm font-bold tabular ${delta >= 0 ? 'text-success' : 'text-danger'}`}
          >
            {delta >= 0 ? `+${delta}` : delta}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/** Shown beside a single active match: the steps that stop most disputes. */
function MatchChecklist({ match }: { match: MatchView }) {
  const opponentId = match.opponent?.inGameId;
  const steps = [
    {
      title: 'Find them in game',
      body: opponentId
        ? `Their ${match.game.name} ID is ${opponentId}.`
        : 'Their game ID is in the match room.',
    },
    {
      title: 'Agree the room in chat',
      body: 'Confirm the time, room code and settings before you start.',
    },
    {
      title: 'Screenshot the final score',
      body: 'Capture the full result screen. It is your proof.',
    },
    {
      title: 'Report together',
      body: 'Both submit the score. Matching reports confirm straight away.',
    },
  ];
  return (
    <section className="surface-card space-y-4 rounded-card p-5 md:p-6">
      <h3 className="eyebrow">Before you play</h3>
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="font-display text-[12px] font-bold italic text-accent tabular">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <p className="text-body-sm font-semibold text-fg">{step.title}</p>
              <p className="break-words text-caption text-fg-subtle">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link
        href={`/matches/${match.id}`}
        className="inline-block font-display text-[10px] font-bold uppercase tracking-[0.08em] text-accent hover:underline"
      >
        Open match chat →
      </Link>
    </section>
  );
}
