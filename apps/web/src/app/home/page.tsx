'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Banner,
  Button,
  CountUp,
  EmptyState,
  Icon,
  RatingBadge,
  RankTierBadge,
  StatusChip,
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

function StatCard({
  label,
  value,
  change,
  trend,
}: {
  label: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down';
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="label-caps text-fg-muted">{label}</p>
      <p className="mt-1 font-display text-stat-lg font-semibold text-fg tabular">{value}</p>
      {change && (
        <p
          className={`mt-1 text-caption font-semibold ${trend === 'up' ? 'text-success' : 'text-danger'}`}
        >
          {trend === 'up' ? '+' : ''}
          {change} vs last week
        </p>
      )}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { currentGame } = useGame();

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
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-overlay rounded-sm" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-24 bg-overlay rounded-card" />
          <div className="h-24 bg-overlay rounded-card" />
          <div className="h-24 bg-overlay rounded-card" />
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
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-h1 font-semibold text-fg">
            Welcome back, {user?.username ?? 'Player'}
          </h1>
          <p className="text-body-sm text-fg-muted">{currentGame} dashboard</p>
        </div>
        <Link href="/play">
          <Button>Find a challenge</Button>
        </Link>
      </header>

      {user && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 rounded-card border border-line bg-surface">
            <Avatar username={user.username} size={64} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-h1 font-semibold text-fg">{user.username}</h2>
                <StatusChip label="Active" variant="win" />
              </div>
              <div className="flex items-center gap-4 mt-2 flex-wrap text-body-sm text-fg-muted">
                <span className="flex items-center gap-1">
                  <Icon name="trophy" size={16} /> {rating?.tierLabel ?? 'Rookie'}
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="star" size={16} /> {rating?.value ?? 0}
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="shield" size={16} /> {user.reputationLabel ?? 'New'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CountUp
                value={rating?.value ?? 0}
                className="font-display text-stat-lg font-semibold text-fg tabular"
              />
              <RankTierBadge tier={(parseInt(rating?.tier as string) ?? 1) as 1 | 2 | 3 | 4 | 5} />
            </div>
          </div>

          <div className="flex flex-col md:grid md:grid-cols-3 gap-4">
            <StatCard label="Rating" value={rating?.value?.toLocaleString('en-NG') ?? '0'} />
            <StatCard label="Record" value={`${rating?.wins ?? 0}–${rating?.losses ?? 0}`} />
            <StatCard label="Streak" value={`W${rating?.streak ?? 0}`} />
          </div>

          <div className="flex gap-2 border-b border-line">
            {(['matches', 'challenges'] as const).map((tab) => (
              <button
                key={tab}
                className={`flex-1 py-2 px-4 font-display text-body-sm font-semibold rounded-t-card transition-colors ${
                  tab === 'matches'
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {matches.length > 0 ? (
            <section aria-labelledby="recent-matches" className="space-y-3">
              <h3 id="recent-matches" className="label-caps text-accent">
                Recent matches
              </h3>
              {matches.map((match) => (
                <Link
                  key={match.id}
                  href={`/matches/${match.id}`}
                  className="flex flex-col gap-2 rounded-card border bg-surface p-3 transition-colors hover:border-line-strong"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-h3 font-semibold text-fg">
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
                <Link href="/play">
                  <Button>Find a challenge</Button>
                </Link>
              }
            />
          )}

          {challenges.length > 0 ? (
            <section aria-labelledby="recent-challenges" className="space-y-3">
              <h3 id="recent-challenges" className="label-caps text-accent">
                Your open challenges
              </h3>
              {challenges.map((c) => (
                <article
                  key={c.id}
                  className="flex items-center gap-3 rounded-card border border-line bg-surface p-3"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-display text-body font-semibold text-fg">
                      {c.game.name}
                    </span>
                    <StatusChip label={c.format.name} variant="neutral" />
                  </div>
                  <p className="shrink-0 font-display text-h3 font-semibold text-accent tabular">
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
