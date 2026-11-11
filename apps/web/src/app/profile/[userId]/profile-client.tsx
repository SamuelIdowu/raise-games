'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Avatar,
  Button,
  CountUp,
  Icon,
  ReputationBadge,
  StatusChip,
  useToast,
} from '@/components/ui';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface GameProfileDto {
  id: string;
  gameId: string;
  gameKey: string;
  gameName: string;
  inGameId: string;
  city: string | null;
  campus: string | null;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  provisional: boolean;
}

async function fetchProfile(userId: string): Promise<GameProfileDto[]> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const res = await fetch(`${API_BASE}/profiles/${userId}`, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) return [];
  return res.json();
}

export function ProfileClient() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const [profiles, setProfiles] = useState<GameProfileDto[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    fetchProfile(userId).then((data) => {
      if (cancelled) return;
      setProfiles(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleCopy = (id: string) => {
    void navigator.clipboard.writeText(id);
    toast({ title: 'Copied', description: `${id} copied to clipboard` });
  };

  if (loading) return <div>Loading...</div>;

  const p = profiles[0];

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-card border border-line bg-surface">
        <div className="flex items-center gap-3">
          <Avatar username={p?.gameName ?? 'Player'} size={64} />
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-h1 font-semibold text-fg">
              {p?.gameName ?? 'Player'}
            </h1>
            <p className="text-body-sm text-fg-muted">{p?.city ?? 'Unknown city'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CountUp
            value={p?.rating ?? 1000}
            className="font-display text-stat-lg font-semibold text-fg tabular"
          />
          <Button>Challenge</Button>
        </div>
      </header>

      <div className="flex flex-col md:grid md:grid-cols-3 gap-4">
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="label-caps text-fg-muted">Rating</p>
          <p className="mt-1 font-display text-stat-lg font-semibold text-fg tabular">
            {p?.rating ?? 1000}
          </p>
        </div>
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="label-caps text-fg-muted">Record</p>
          <p className="mt-1 font-display text-stat-lg font-semibold text-fg tabular">
            {p?.wins ?? 0}-{p?.losses ?? 0}-{p?.draws ?? 0}
          </p>
        </div>
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="label-caps text-fg-muted">Streak</p>
          <p className="mt-1 font-display text-stat-lg font-semibold text-fg tabular">
            W{p?.streak ?? 0}
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-line">
        {profiles.map((profile) => (
          <button
            key={profile.gameKey}
            onClick={() => {}}
            className="flex-1 py-2 px-4 font-display text-body-sm font-semibold rounded-t-card transition-colors text-accent border-b-2 border-accent"
          >
            {profile.gameName}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-h3 font-semibold text-fg">Game IDs</h3>
          <Button variant="ghost" size="sm">
            Add game ID
          </Button>
        </div>
        <div className="space-y-2">
          {profiles.map((profile) => (
            <div
              key={profile.gameId}
              className="flex items-center justify-between p-3 rounded-card bg-surface border border-line"
            >
              <div className="flex items-center gap-3">
                <span className="font-display text-body-sm font-semibold text-fg">
                  {profile.gameName}
                </span>
                <StatusChip
                  label={profile.provisional ? 'Provisional' : 'Verified'}
                  variant="neutral"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-display text-body-sm font-semibold text-fg tabular">
                  {profile.inGameId}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(profile.inGameId)}
                  className="text-caption text-accent hover:underline flex items-center gap-1"
                >
                  <Icon name="copy" size={14} /> Copy
                </button>
                <ReputationBadge level="new" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-card border border-line bg-surface p-4">
        <h3 className="font-display text-h3 font-semibold text-fg">Recent matches</h3>
        <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-6 text-center">
          <Icon name="trophy" size={32} className="text-fg-subtle" />
          <h3 className="font-display text-h3 font-semibold text-fg">No matches yet</h3>
          <p className="text-body-sm text-fg-muted">Play your first match to see results here.</p>
          <Button>Find a challenge</Button>
        </div>
      </div>

      <div className="hidden sm:block">
        <Button>Challenge</Button>
      </div>
    </div>
  );
}
