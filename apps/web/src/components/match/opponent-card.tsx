'use client';

import type { MatchPlayer } from '@raise/api-client';
import {
  Avatar,
  Icon,
  RankTierBadge,
  RatingBadge,
  ReputationBadge,
  useToast,
} from '@/components/ui';
import type { TierLevel } from '@/components/ui';

const TIER_INDEX: Record<string, TierLevel> = {
  rookie: 1,
  challenger: 2,
  contender: 3,
  elite: 4,
  champion: 5,
};

/** Opponent card (UX Flow 4): avatar, username, rating, reputation, game ID + copy. */
export function OpponentCard({
  player,
  heading = 'Opponent',
}: {
  player: MatchPlayer;
  heading?: string;
}) {
  const { toast } = useToast();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(player.gameId);
      toast({ title: 'Game ID copied', description: player.gameId, variant: 'status' });
    } catch {
      toast({
        title: 'Could not copy',
        description: 'Select the ID and copy it manually.',
        variant: 'error',
      });
    }
  };

  return (
    <section aria-label={heading} className="surface-card rounded-card p-4">
      <h2 className="label-caps mb-3 text-fg-muted">{heading}</h2>
      <div className="flex items-start gap-3">
        <Avatar username={player.username} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-body font-semibold text-fg">{player.username}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RatingBadge value={player.rating} provisional={player.provisional} />
            <RankTierBadge
              tier={TIER_INDEX[player.rankTier.toLowerCase()] ?? 1}
              label={player.rankLabel}
            />
            <span
              className="text-caption text-fg-muted tabular"
              aria-label={`Record ${player.record}`}
            >
              {player.record}
            </span>
            <ReputationBadge level={player.reputation} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="rounded-[2px] border border-line bg-raised px-2 py-1 font-mono text-body-sm text-fg">
              {player.gameId}
            </span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-caption text-accent hover:underline"
            >
              <Icon name="copy" size={14} aria-hidden /> Copy game ID
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
