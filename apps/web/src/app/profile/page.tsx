'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Button,
  CountUp,
  EmptyState,
  Icon,
  RankTierBadge,
  StatusChip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  useToast,
} from '@/components/ui';
import { profilesApi, matchesApi, type GameProfile, type MatchView } from '@raise/api-client';
import { formatRelative } from '@/lib/datetime';
import { outcomeTag } from '@/lib/match-status';
import { isParticipantView } from '@raise/api-client';

const tabClass = (active: boolean) =>
  'flex-1 py-2 px-4 font-display text-body-sm font-semibold rounded-t-card transition-colors ' +
  (active ? 'text-accent border-b-2 border-accent' : 'text-fg-muted hover:text-fg');

const ratingClass = (rating: number) =>
  'font-display font-semibold tabular ' +
  (rating > 0 ? 'text-success' : rating < 0 ? 'text-danger' : 'text-fg');

const statTrendClass = (trend?: 'up' | 'down') =>
  'mt-1 text-caption font-semibold ' + (trend === 'up' ? 'text-success' : 'text-danger');

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
        <p className={statTrendClass(trend)}>
          {trend === 'up' ? '+' : ''}
          {change} vs last week
        </p>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'matches' | 'game-ids'>('overview');

  const [profiles, setProfiles] = useState<GameProfile[]>([]);
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [gameIds, setGameIds] = useState<{ gameKey: string; label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    const load = async () => {
      try {
        const [prof, matchRes] = await Promise.all([
          profilesApi.listMine(),
          matchesApi.list('all'),
        ]);
        if (live) {
          setProfiles(prof);
          setMatches(matchRes.items.filter(isParticipantView));
          setGameIds(
            prof.map((p) => ({
              gameKey: p.gameKey,
              label: p.gameName,
              value: p.inGameId,
            })),
          );
          setError(null);
        }
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Could not load profile.');
      } finally {
        if (live) setLoading(false);
      }
    };

    void load();
    const id = setInterval(() => document.visibilityState === 'visible' && void load(), 30_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 bg-overlay rounded-sm" />
          <div className="space-y-2">
            <div className="h-6 w-48 bg-overlay rounded-sm" />
            <div className="h-4 w-64 bg-overlay rounded-sm" />
          </div>
        </div>
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
      <div className="space-y-6">
        <p className="text-center text-fg-muted">{error}</p>
        <Button variant="secondary" onClick={() => router.refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  // Use the first profile as the main profile (or current game if available)
  const mainProfile = profiles[0];
  const rating = mainProfile
    ? {
        value: mainProfile.rating,
        tier: parseInt(mainProfile.rankTier) || 1,
        tierLabel: mainProfile.rankLabel,
        wins: mainProfile.wins,
        losses: mainProfile.losses,
        draws: mainProfile.draws,
        streak: mainProfile.streak,
        provisional: mainProfile.provisional,
      }
    : null;

  const user = mainProfile
    ? {
        username: mainProfile.displayName ?? mainProfile.inGameId,
        reputationLabel: mainProfile.reputation,
        createdAt: mainProfile.createdAt,
      }
    : null;
  const ids = gameIds;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-h1 font-semibold text-fg">Profile</h1>
          <p className="text-body-sm text-fg-muted">
            {user?.username} · Joined{' '}
            {user?.createdAt
              ? new Date(user.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  year: 'numeric',
                })
              : '2026'}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => router.push('/settings')}>
          Edit profile
        </Button>
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
                  <Icon name="star" size={16} /> {rating?.value?.toLocaleString('en-NG') ?? '0'}
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
              <RankTierBadge
                tier={(parseInt(String(rating?.tier ?? '1')) ?? 1) as 1 | 2 | 3 | 4 | 5}
              />
            </div>
          </div>

          <div className="flex flex-col md:grid md:grid-cols-3 gap-4">
            <StatCard label="Rating" value={rating?.value?.toLocaleString('en-NG') ?? '0'} />
            <StatCard label="Record" value={`${rating?.wins ?? 0}–${rating?.losses ?? 0}`} />
            <StatCard label="Streak" value={`W${rating?.streak ?? 0}`} />
          </div>

          <div className="flex gap-2 border-b border-line">
            {(['overview', 'matches', 'game-ids'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={tabClass(activeTab === tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-h3 font-semibold text-fg">Game IDs</h3>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('game-ids')}>
                  Edit
                </Button>
              </div>
              {ids.length > 0 ? (
                <div className="space-y-2">
                  {ids.map((g) => (
                    <div
                      key={g.gameKey}
                      className="flex items-center justify-between p-3 rounded-card bg-surface border border-line"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-display text-body-sm font-semibold text-fg">
                          {g.label}
                        </span>
                        <StatusChip label="Verified" variant="win" />
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-body-sm text-fg bg-raised px-2 py-1 rounded-sm">
                          {g.value}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(g.value);
                            toast({
                              title: 'Copied',
                              description: `${g.label} ID copied to clipboard`,
                            });
                          }}
                          className="text-caption text-accent hover:underline flex items-center gap-1"
                        >
                          <Icon name="copy" size={14} /> Copy
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="gamepad-2"
                  title="No game IDs added"
                  description="Add your game IDs so opponents can find you."
                  action={<Button onClick={() => setActiveTab('game-ids')}>Add game ID</Button>}
                />
              )}
            </div>
          )}

          {activeTab === 'matches' && (
            <Table>
              <TableHead>
                <TableHeaderCell>Match</TableHeaderCell>
                <TableHeaderCell>Game</TableHeaderCell>
                <TableHeaderCell>Opponent</TableHeaderCell>
                <TableHeaderCell numeric>Result</TableHeaderCell>
                <TableHeaderCell numeric>Rating</TableHeaderCell>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableHead>
              <TableBody>
                {matches.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-display text-accent">{m.id}</TableCell>
                    <TableCell>{m.game.name}</TableCell>
                    <TableCell>{m.opponent?.username ?? '—'}</TableCell>
                    <TableCell numeric>
                      <StatusChip
                        label={outcomeTag(m)?.label ?? '—'}
                        variant={outcomeTag(m)?.variant ?? 'neutral'}
                      />
                    </TableCell>
                    <TableCell numeric>
                      <span className={ratingClass(m.ratingDelta ?? 0)}>
                        {m.ratingDelta && m.ratingDelta > 0 ? '+' : ''}
                        {m.ratingDelta ?? 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      {formatRelative(m.confirmedAt ?? new Date().toISOString())}
                    </TableCell>
                    <TableCell>
                      <StatusChip label="Confirmed" variant="win" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {activeTab === 'game-ids' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-h3 font-semibold text-fg">Game IDs</h3>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push('/settings?tab=game-ids')}
                >
                  Add game ID
                </Button>
              </div>
              {ids.length > 0 ? (
                <div className="space-y-2">
                  {ids.map((g) => (
                    <div
                      key={g.gameKey}
                      className="flex items-center justify-between p-3 rounded-card bg-surface border border-line"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-display text-body-sm font-semibold text-fg">
                          {g.label}
                        </span>
                        <StatusChip label="Verified" variant="win" />
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-body-sm text-fg bg-raised px-2 py-1 rounded-sm">
                          {g.value}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(g.value);
                            toast({
                              title: 'Copied',
                              description: `${g.label} ID copied to clipboard`,
                            });
                          }}
                          className="text-caption text-accent hover:underline flex items-center gap-1"
                        >
                          <Icon name="copy" size={14} /> Copy
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="gamepad-2"
                  title="No game IDs added"
                  description="Add your game IDs so opponents can find you."
                  action={
                    <Button onClick={() => router.push('/settings?tab=game-ids')}>
                      Add game ID
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
