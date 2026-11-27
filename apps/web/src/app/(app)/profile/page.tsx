'use client';

import { useState } from 'react';
import Link from 'next/link';
import { isParticipantView, type GameProfile } from '@raise/api-client';
import {
  Avatar,
  Banner,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  PageHeader,
  RankTierBadge,
  ReputationBadge,
  SkeletonCard,
  StatCard,
  StatusChip,
  useToast,
} from '@/components/ui';
import { AppPage, RailCard, SectionHeading } from '@/components/app/AppPage';
import { NextMatchRail } from '@/components/app/widgets';
import { RatingSparkline, ratingSeries } from '@/components/app/RatingSparkline';
import { useGame } from '@/components/shell/GameProvider';
import { useLeaderboard, useMatches, useMyProfiles } from '@/lib/app-data';
import { formatRelative } from '@/lib/datetime';
import { TIER_LEVEL, matchChip, outcomeTag } from '@/lib/match-status';

function streakLabel(streak: number) {
  if (streak > 0) return `W${streak}`;
  if (streak < 0) return `L${-streak}`;
  return '—';
}

/**
 * My profile (UX Flow 8): rank, rating, record, streak and reputation per game, rating
 * trend, recent matches and game IDs. The game in focus follows the header switcher.
 */
export default function ProfilePage() {
  const { toast } = useToast();
  const { currentGame, setCurrentGame } = useGame();
  const profiles = useMyProfiles();
  const finished = useMatches('finished');
  const [copied, setCopied] = useState<string | null>(null);

  const list = profiles.data ?? [];
  const profile = list.find((p) => p.gameKey === currentGame) ?? list[0];
  const ladder = useLeaderboard(profile?.gameKey ?? currentGame);
  const me = ladder.data?.me ?? null;

  if (profiles.error && !profiles.data) {
    return (
      <Banner variant="offline" action={<Button onClick={profiles.reload}>Retry</Button>}>
        Could not load your profile. {profiles.error}
      </Banner>
    );
  }

  if (profiles.loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <SkeletonCard className="h-28" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonCard key={i} className="h-[104px]" />
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <EmptyState
        pixel="gamepad"
        eyebrow="Set up your profile"
        title="No games yet"
        description="Pick the games you play and add your in-game IDs so opponents can find you."
        steps={['Pick your games', 'Add your in-game IDs', 'Accept your first challenge']}
        action={
          <ButtonLink href="/onboarding/games" arrow>
            Add a game
          </ButtonLink>
        }
      />
    );
  }

  const username = profile.displayName ?? 'Player';
  const joined = new Date(
    Math.min(...list.map((p) => new Date(p.createdAt).getTime())),
  ).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' });

  const gameMatches = (finished.data?.items ?? [])
    .filter(isParticipantView)
    .filter((m) => m.game.key === profile.gameKey);
  const series = ratingSeries(profile.rating, gameMatches);

  const copy = (p: GameProfile) => {
    void navigator.clipboard.writeText(p.inGameId);
    setCopied(p.gameKey);
    toast({ title: 'Copied', description: `${p.gameName} ID copied`, variant: 'status' });
  };

  return (
    <AppPage
      header={
        <PageHeader
          eyebrow={`Joined ${joined}`}
          title="Profile"
          action={
            <ButtonLink href="/settings" variant="secondary" size="sm">
              Edit profile
            </ButtonLink>
          }
        />
      }
      rail={
        <>
          <RailCard title="Rating trend" href="/leaderboard" linkLabel="Leaderboard">
            {series.length > 1 ? (
              <RatingSparkline points={series} />
            ) : (
              <p className="text-body-sm text-fg-muted">
                Your rating line appears after your first confirmed {profile.gameName} match.
              </p>
            )}
          </RailCard>
          <NextMatchRail />
        </>
      }
    >
      {/* Identity */}
      <Card className="flex flex-col gap-5 md:flex-row md:items-center">
        <Avatar username={username} size={64} />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="truncate font-display text-h2 font-black uppercase text-fg">{username}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <RankTierBadge tier={TIER_LEVEL[profile.rankTier] ?? 1} label={profile.rankLabel} />
            <ReputationBadge level={profile.reputation} />
            {profile.city || profile.campus ? (
              <span className="label-caps flex items-center gap-1.5 text-fg-subtle">
                <Icon name="map-pin" size={14} />
                {[profile.campus, profile.city].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Games I play */}
      <section aria-labelledby="my-games" className="space-y-4">
        <SectionHeading id="my-games">Your games</SectionHeading>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
          {list.map((p) => {
            const selected = p.gameKey === profile.gameKey;
            return (
              <button
                key={p.gameKey}
                type="button"
                aria-pressed={selected}
                onClick={() => setCurrentGame(p.gameKey as typeof currentGame)}
                className={`surface-card space-y-3 rounded-card p-4 text-left transition-colors hover:border-line-strong ${selected ? 'border-accent' : ''}`}
              >
                <p className="font-display text-[12px] font-bold uppercase tracking-[0.06em] text-fg">
                  {p.gameName}
                </p>
                <p className="font-display text-[28px] font-black leading-none text-accent tabular">
                  {p.rating.toLocaleString()}
                </p>
                <p className="text-caption text-fg-subtle tabular">
                  {p.rankLabel} · {p.wins}-{p.losses}-{p.draws}
                </p>
              </button>
            );
          })}
          {list.length < 3 ? (
            <Link
              href="/onboarding/games"
              className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong p-4 text-fg-subtle transition-colors hover:border-accent hover:text-accent"
            >
              <Icon name="plus" size={20} />
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.08em]">
                Add a game
              </span>
            </Link>
          ) : null}
        </div>
      </section>

      {/* Focused game stats */}
      <section aria-label={`${profile.gameName} stats`} className="space-y-4">
        <SectionHeading>{profile.gameName}</SectionHeading>
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
      </section>

      {/* Recent matches */}
      <section aria-labelledby="recent" className="space-y-4">
        <SectionHeading id="recent" href="/matches" linkLabel="All matches">
          Recent {profile.gameName} matches
        </SectionHeading>
        {finished.loading ? (
          <SkeletonCard className="h-40" />
        ) : gameMatches.length > 0 ? (
          <ul className="surface-card divide-y divide-line rounded-card">
            {gameMatches.slice(0, 8).map((m) => {
              const tag = outcomeTag(m);
              const chip = matchChip(m);
              return (
                <li key={m.id}>
                  <Link
                    href={`/matches/${m.id}`}
                    className="flex items-center gap-3 p-4 transition-colors hover:bg-bg-subtle"
                  >
                    <Avatar username={m.opponent.username} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-semibold text-fg">
                        vs {m.opponent.username}
                      </span>
                      <span className="block truncate text-caption text-fg-subtle">
                        {m.format.name}
                        {m.completedAt ? ` · ${formatRelative(m.completedAt)}` : ''}
                      </span>
                    </span>
                    {tag ? (
                      <StatusChip label={tag.label} variant={tag.variant} icon={tag.icon} />
                    ) : (
                      <StatusChip label={chip.label} variant={chip.variant} icon={chip.icon} />
                    )}
                    {m.ratingDelta !== null ? (
                      <span
                        className={`w-12 text-right font-display text-body-sm font-bold tabular ${m.ratingDelta >= 0 ? 'text-success' : 'text-danger'}`}
                      >
                        {m.ratingDelta >= 0 ? `+${m.ratingDelta}` : m.ratingDelta}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            pixel="crown"
            compact
            title="No matches yet"
            description={`Play your first ${profile.gameName} match to start your record.`}
            action={
              <ButtonLink href="/play" arrow>
                Find a challenge
              </ButtonLink>
            }
          />
        )}
      </section>

      {/* Game IDs */}
      <section aria-labelledby="game-ids" className="space-y-4">
        <SectionHeading id="game-ids" href="/settings?tab=game-ids" linkLabel="Edit">
          Game IDs
        </SectionHeading>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
          {list.map((p) => (
            <li
              key={p.gameKey}
              className="surface-card flex items-center justify-between gap-3 rounded-card p-4"
            >
              <div className="min-w-0">
                <p className="label-caps text-fg-subtle">{p.gameName}</p>
                <code className="mt-1 block truncate font-mono text-body-sm text-fg">
                  {p.inGameId}
                </code>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copy(p)}
                aria-label={`Copy ${p.gameName} ID ${p.inGameId}`}
              >
                <Icon name={copied === p.gameKey ? 'check' : 'copy'} size={14} />
                {copied === p.gameKey ? 'Copied' : 'Copy'}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </AppPage>
  );
}
