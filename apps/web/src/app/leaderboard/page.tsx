'use client';

import { useState } from 'react';
import {
  Avatar,
  CountUp,
  Icon,
  RankTierBadge,
  ReputationBadge,
  ReputationLevel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';

const MOCK_LEADERBOARD = [
  {
    rank: 1,
    username: 'Chioma_O',
    rating: 1482,
    record: '45–3–2',
    tier: 5,
    reputation: 'trusted',
    avatar: 'Chioma_O',
  },
  {
    rank: 2,
    username: 'TundePlays',
    rating: 1356,
    record: '38–8–1',
    tier: 4,
    reputation: 'reliable',
    avatar: 'TundePlays',
  },
  {
    rank: 3,
    username: 'Ade_Gamer',
    rating: 1298,
    record: '32–12–3',
    tier: 4,
    reputation: 'reliable',
    avatar: 'Ade_Gamer',
  },
  {
    rank: 4,
    username: 'Emeka_Plays',
    rating: 1247,
    record: '28–9–2',
    tier: 4,
    reputation: 'reliable',
    avatar: 'Emeka_Plays',
  },
  {
    rank: 5,
    username: 'Bisi_Ball',
    rating: 1198,
    record: '22–14–1',
    tier: 3,
    reputation: 'low',
    avatar: 'Bisi_Ball',
  },
  {
    rank: 6,
    username: 'You',
    rating: 1180,
    record: '20–5–1',
    tier: 3,
    reputation: 'reliable',
    avatar: 'You',
  },
  {
    rank: 7,
    username: 'Funmi_FC',
    rating: 1134,
    record: '18–11–2',
    tier: 3,
    reputation: 'new',
    avatar: 'Funmi_FC',
  },
  {
    rank: 8,
    username: 'Kemi_Kicks',
    rating: 1092,
    record: '15–13–1',
    tier: 2,
    reputation: 'new',
    avatar: 'Kemi_Kicks',
  },
  {
    rank: 9,
    username: 'Chidi_Champs',
    rating: 1056,
    record: '12–16–0',
    tier: 2,
    reputation: 'low',
    avatar: 'Chidi_Champs',
  },
  {
    rank: 10,
    username: 'Amaka_Pro',
    rating: 1021,
    record: '10–18–2',
    tier: 2,
    reputation: 'new',
    avatar: 'Amaka_Pro',
  },
];

const TIER_LABELS = ['Rookie', 'Challenger', 'Contender', 'Elite', 'Champion'];
export default function LeaderboardPage() {
  const [filter, setFilter] = useState<'all' | 'fifa25' | 'cod' | 'tekken8' | 'streetfighter6'>(
    'all',
  );
  const [period, setPeriod] = useState<'all-time' | 'season' | 'monthly'>('all-time');
  const [location, setLocation] = useState<'all' | 'campus' | 'city'>('all');

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-h1 font-semibold text-fg">Leaderboard</h1>
      </header>

      <div className="flex flex-wrap gap-2">
        <select
          value={filter}
          onChange={(e) =>
            setFilter(e.target.value as 'all' | 'fifa25' | 'cod' | 'tekken8' | 'streetfighter6')
          }
          className="h-10 rounded-control border border-line bg-raised px-3 py-1 text-body-sm text-fg focus:border-accent focus:outline-none appearance-none bg-no-repeat bg-right-2 bg-center pr-8"
        >
          <option value="all">All games</option>
          <option value="fifa25">FIFA 25</option>
          <option value="cod">Call of Duty</option>
          <option value="tekken8">Tekken 8</option>
          <option value="streetfighter6">Street Fighter 6</option>
        </select>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as 'all-time' | 'season' | 'monthly')}
          className="h-10 rounded-control border border-line bg-raised px-3 py-1 text-body-sm text-fg focus:border-accent focus:outline-none appearance-none bg-no-repeat bg-right-2 bg-center pr-8"
        >
          <option value="all-time">All-time</option>
          <option value="season">Season</option>
          <option value="monthly">Monthly</option>
        </select>
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value as 'all' | 'campus' | 'city')}
          className="h-10 rounded-control border border-line bg-raised px-3 py-1 text-body-sm text-fg focus:border-accent focus:outline-none appearance-none bg-no-repeat bg-right-2 bg-center pr-8"
        >
          <option value="all">All</option>
          <option value="campus">Campus</option>
          <option value="city">City</option>
        </select>
      </div>

      <Table>
        <TableHead>
          <TableHeaderCell>Rank</TableHeaderCell>
          <TableHeaderCell>Player</TableHeaderCell>
          <TableHeaderCell>Tier</TableHeaderCell>
          <TableHeaderCell numeric>Rating</TableHeaderCell>
          <TableHeaderCell>Record</TableHeaderCell>
          <TableHeaderCell>Reputation</TableHeaderCell>
        </TableHead>
        <TableBody>
          {MOCK_LEADERBOARD.map((player, index) => (
            <TableRow key={player.username} selected={index === 5}>
              <TableCell className="font-display text-accent">
                {player.rank <= 3 ? (
                  <span className="inline-flex items-center gap-1 font-display text-accent">
                    <Icon name="trophy" size={16} /> #{player.rank}
                  </span>
                ) : (
                  '#' + player.rank
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar username={player.avatar} size={32} />
                  <span className={index === 5 ? 'font-semibold text-accent' : 'text-fg'}>
                    {player.username}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <RankTierBadge tier={player.tier as 1 | 2 | 3 | 4 | 5} />
              </TableCell>
              <TableCell numeric>
                <CountUp
                  value={player.rating}
                  className="font-display text-body font-semibold text-fg tabular"
                />
              </TableCell>
              <TableCell>{player.record}</TableCell>
              <TableCell>
                <ReputationBadge level={player.reputation as ReputationLevel} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-4 rounded-card border border-line bg-surface p-4">
        <h3 className="label-caps mb-3 text-fg-muted">Your position</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar username="You" size={32} />
            <div>
              <p className="font-display text-body font-semibold text-accent">You</p>
              <p className="text-caption text-fg-muted">
                #6 &middot; &ldquo;{TIER_LABELS[2]}&rdquo; &middot; 1,180 rating
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-stat-lg font-semibold text-fg tabular">1,180</p>
            <p className="text-caption text-fg-muted">20–5–1 · Reliable</p>
          </div>
        </div>
      </div>
    </div>
  );
}
