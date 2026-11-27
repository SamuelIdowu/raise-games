import { rankTierForRating, rankTierLabel } from '../shared/ranks';

export interface ChallengeCardRow {
  id: string;
  status: string;
  createdAt: Date;
  startsAt: Date;
  endsAt: Date;
  acceptanceDeadline: Date;
  stakeAmountMinor: number;
  currency: string;
  ratingGap: number | null;
  posterId: string;
  gameId: string;
  gameKey: string;
  gameName: string;
  formatId: string;
  formatKey: string;
  formatName: string;
  username: string | null;
  inGameId: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  provisional: boolean;
  targetPlayerId?: string | null;
}

/** A player a group challenge is offered to. */
export interface GroupMember {
  userId: string;
  username: string;
  /** They declined; the challenge stays open for the rest. */
  declined: boolean;
}

export interface ChallengeCardDto {
  id: string;
  status: string;
  createdAt: string;
  game: { id: string; key: string; name: string };
  format: { id: string; key: string; name: string };
  timeWindow: { startsAt: string; endsAt: string };
  expiresAt: string;
  poster: {
    userId: string;
    username: string;
    rating: number;
    rankTier: string;
    rankLabel: string;
    provisional: boolean;
    wins: number;
    losses: number;
    draws: number;
    record: string;
    reputation: 'new';
  };
  stake: {
    amountMinor: number;
    currency: string;
    display: string;
    band: string | null;
  };
  ratingGap: null;
  isMine: boolean;
  /** Addressed to the viewer (direct, or a group they are in): they can accept or decline. */
  isForMe: boolean;
  /** Who can accept: anyone on the board, one player, or a group (first to accept plays). */
  audience: 'open' | 'direct' | 'group';
  /** Group challenges only: the invited players. */
  group?: GroupMember[];
  /** Present in the detail view. */
  rules?: string;
  /** Present in detail view for direct challenges. */
  target?: {
    userId: string;
    username: string;
    rating: number;
    wins: number;
    losses: number;
    draws: number;
    provisional: boolean;
  } | null;
}

function displayStatus(status: string, acceptanceDeadline: Date, now: Date): string {
  if (status === 'open' && acceptanceDeadline.getTime() <= now.getTime()) return 'expired';
  return status;
}

export function toChallengeCard(
  row: ChallengeCardRow,
  viewerId: string,
  now: Date = new Date(),
  group?: GroupMember[],
): ChallengeCardDto {
  const inGroup = !!group?.some((m) => m.userId === viewerId && !m.declined);
  const rankTier = rankTierForRating(row.rating);

  return {
    id: row.id,
    status: displayStatus(row.status, row.acceptanceDeadline, now),
    createdAt: row.createdAt.toISOString(),
    game: { id: row.gameId, key: row.gameKey, name: row.gameName },
    format: { id: row.formatId, key: row.formatKey, name: row.formatName },
    timeWindow: {
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
    },
    expiresAt: row.acceptanceDeadline.toISOString(),
    poster: {
      userId: row.posterId,
      username: row.username ?? row.inGameId,
      rating: row.rating,
      rankTier,
      rankLabel: rankTierLabel(rankTier),
      provisional: row.provisional,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      record: `${row.wins}\u2013${row.losses}\u2013${row.draws}`,
      reputation: 'new',
    },
    stake: {
      amountMinor: row.stakeAmountMinor,
      currency: row.currency,
      display:
        row.stakeAmountMinor === 0 ? 'Free' : `${row.currency} ${row.stakeAmountMinor / 100}`,
      band: null,
    },
    ratingGap: null,
    isMine: row.posterId === viewerId,
    isForMe: (Boolean(row.targetPlayerId) && row.targetPlayerId === viewerId) || inGroup,
    audience: group && group.length > 0 ? 'group' : row.targetPlayerId ? 'direct' : 'open',
    ...(group && group.length > 0 ? { group } : {}),
  };
}
