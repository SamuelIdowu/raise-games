'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Banner,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  RatingBadge,
  RankTierBadge,
  StatCard,
  StatusChip,
  PageHeader,
  PromoBanner,
} from '@/components/ui';
import {
  challengesApi,
  matchesApi,
  profilesApi,
  type GameProfile,
  isParticipantView,
} from '@raise/api-client';
import { formatRelative } from '@/lib/datetime';
import { matchChip, outcomeTag } from '@/lib/match-status';
import { useGame } from '@/components/shell/GameProvider';

const POLL_MS = 20_000;

export default function HomePage() {
  const router = useRouter();
  const { currentGame, games } = useGame();
  const gameLabel = games.find((g) => g.id === currentGame)?.label ?? 'Your';

  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [matches, setMatches] = useState<import('@raise/api-client').MatchView[]>([]);
  const [challenges, setChallenges] = useState<import('@raise/api-client').ChallengeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    const load = async () => {
      try {
        const [prof, matchRes, chalRes] = await Promise.all([
          profilesApi.listMine(),
          matchesApi.list('all'),
          challengesApi.list({ limit: 5 }),
        ]);
        if (live) {
          setProfiles(prof);
          setMatches(matchRes.items.filter(isParticipantView).slice(0, 3));
          setChallenges(chalRes.items);
          setError(null);
        }
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Could not load dashboard.');
      } finally {
        if (live) setLoading(false);
      }
    };

    void load();
    const id = setInterval(() => document.visibilityState === 'visible' && void load(), POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="animate-shimmer h-8 w-48 rounded-xs" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="animate-shimmer chamfer-tr h-28" />
          <div className="animate-shimmer chamfer-tr h-28" />
          <div className="animate-shimmer chamfer-tr h-28" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Banner variant="offline" action={<Button onClick={() => router.refresh()}>Retry</Button>}>
        {error}
      </Banner>
    );
  }

  // Find the profile for the current game
  const profile = profiles.find((p) => p.gameKey === currentGame) ?? profiles[0];
  const rating = profile
    ? {
        value: profile.rating,
        tier: profile.rankTier,
        tierLabel: profile.rankLabel,
        wins: profile.wins,
        losses: profile.losses,
        draws: profile.draws,
        streak: profile.streak,
        provisional: profile.provisional,
      }
    : null;

  const user = profile
    ? {
        username: profile.displayName ?? profile.inGameId,
        reputationLabel: profile.reputation,
        createdAt: profile.createdAt,
      }
    : null;

  return (
    <div className="mx-auto max-w-[880px] space-y-10">
      <PageHeader
        eyebrow={`${gameLabel} dashboard`}
        title={`Welcome back, ${user?.username ?? 'Player'}`}
        action={
          <ButtonLink href="/play" arrow>
            Find a challenge
          </ButtonLink>
        }
      />

      {user && (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col items-start gap-4 md:flex-row md:items-center">
            <Avatar username={user.username} size={64} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="truncate font-display text-h2 font-black uppercase text-fg">
                  {user.username}
                </h2>
                <StatusChip label="Active" variant="win" />
              </div>
              <div className="label-caps flex flex-wrap items-center gap-4 text-fg-subtle">
                <span className="flex items-center gap-1.5">
                  <Icon name="trophy" size={14} /> {rating?.tierLabel ?? 'Rookie'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon name="shield" size={14} /> {user.reputationLabel ?? 'New'}
                </span>
              </div>
            </div>
            <RankTierBadge
              tier={(parseInt(rating?.tier as string) || 1) as 1 | 2 | 3 | 4 | 5}
              label={rating?.tierLabel}
            />
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Rating" value={rating?.value ?? 0} icon="star" />
            <StatCard
              label="Record"
              value={`${rating?.wins ?? 0}-${rating?.losses ?? 0}-${rating?.draws ?? 0}`}
              icon="crown"
            />
            <StatCard label="Streak" value={`W${rating?.streak ?? 0}`} icon="flame" />
          </div>

          <PromoBanner
            eyebrow="Play and climb"
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
            Pick a game and format, invite anyone or open it to the board. Both players report,
            proof settles disputes.
          </PromoBanner>

          {matches.length > 0 ? (
            <section aria-labelledby="recent-matches" className="space-y-3">
              <h3 id="recent-matches" className="eyebrow">
                Recent matches
              </h3>
              {matches.map((match) => (
                <Link
                  key={match.id}
                  href={`/matches/${match.id}`}
                  className="surface-card flex flex-col gap-2 rounded-card p-4 transition-[transform,border-color] hover:-translate-y-0.5 hover:border-line-strong"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-h3 font-black uppercase text-fg">
                      {match.game.name} <span className="text-fg-muted">· {match.format.name}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {outcomeTag(match) ? (
                        <StatusChip
                          label={outcomeTag(match)!.label}
                          variant={outcomeTag(match)!.variant}
                          icon={outcomeTag(match)!.icon}
                        />
                      ) : null}
                      <StatusChip
                        label={matchChip(match).label}
                        variant={matchChip(match).variant}
                        icon={matchChip(match).icon}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {match.opponent ? (
                      <>
                        <Avatar username={match.opponent.username} size={32} />
                        <span className="min-w-0 flex-1 truncate text-body text-fg">
                          {match.opponent.username}
                        </span>
                        <RatingBadge
                          value={match.opponent.rating}
                          provisional={match.opponent.provisional}
                        />
                      </>
                    ) : (
                      <span className="text-fg-muted">Opponent unknown</span>
                    )}
                  </div>
                  <p className="text-caption text-fg-muted">
                    {match.status === 'confirmed' ? 'Confirmed' : match.status}
                    {match.confirmedAt && (
                      <>
                        {' '}
                        <time dateTime={match.confirmedAt} className="ml-2">
                          {formatRelative(match.confirmedAt)}
                        </time>
                      </>
                    )}
                  </p>
                </Link>
              ))}
            </section>
          ) : (
            <EmptyState
              icon="trophy"
              title="No matches yet"
              description="Accept a challenge or post your own to start playing."
              action={
                <ButtonLink href="/play" arrow>
                  Find a challenge
                </ButtonLink>
              }
            />
          )}

          {challenges.length > 0 ? (
            <section aria-labelledby="recent-challenges" className="space-y-3">
              <h3 id="recent-challenges" className="eyebrow">
                Your open challenges
              </h3>
              {challenges.map((c) => (
                <article
                  key={c.id}
                  className="flex items-center gap-3 surface-card rounded-card p-3"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-display text-body font-semibold text-fg">
                      {c.game.name}
                    </span>
                    <StatusChip label={c.format.name} variant="neutral" />
                  </div>
                  <p className="shrink-0 font-display text-h3 font-black uppercase text-accent tabular">
                    {c.stake.display}
                  </p>
                </article>
              ))}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
