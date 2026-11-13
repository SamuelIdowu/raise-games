import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, ilike, isNull, lt, lte, ne, or } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { decodeCursor, encodeCursor } from '../shared/cursor';
import { escapeLike } from '../shared/like';
import { rankTierForRating, rankTierLabel, rankTierRange } from '../shared/ranks';
import type { PlayerSearchQuery } from './players.schemas';

interface PlayerCursor {
  rating: number;
  id: string;
}

export interface PlayerCardDto {
  userId: string;
  username: string;
  game: { key: string; name: string };
  inGameId: string;
  rating: number;
  rankTier: string;
  rankLabel: string;
  provisional: boolean;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  record: string;
  campus: string | null;
  city: string | null;
  reputation: 'new';
}

export interface PlayerSearchResult {
  items: PlayerCardDto[];
  nextCursor: string | null;
}

@Injectable()
export class PlayersService {
  async search(viewerId: string, query: PlayerSearchQuery): Promise<PlayerSearchResult> {
    const cursor = decodeCursor<PlayerCursor>(query.cursor);
    const conditions = [isNull(schema.users.deletedAt), ne(schema.users.id, viewerId)];

    if (query.game) conditions.push(eq(schema.games.key, query.game));
    if (query.rank) {
      const { min, max } = rankTierRange(query.rank);
      conditions.push(gte(schema.gameProfiles.rating, min));
      if (max !== null) conditions.push(lte(schema.gameProfiles.rating, max));
    }
    if (query.campus) {
      conditions.push(ilike(schema.gameProfiles.campus, `%${escapeLike(query.campus)}%`));
    }
    if (query.city) {
      conditions.push(ilike(schema.gameProfiles.city, `%${escapeLike(query.city)}%`));
    }
    if (cursor) {
      conditions.push(
        or(
          lt(schema.gameProfiles.rating, cursor.rating),
          and(eq(schema.gameProfiles.rating, cursor.rating), lt(schema.gameProfiles.id, cursor.id)),
        )!,
      );
    }

    const rows = await db
      .select({
        profileId: schema.gameProfiles.id,
        userId: schema.gameProfiles.userId,
        username: schema.users.displayName,
        inGameId: schema.gameProfiles.inGameId,
        rating: schema.gameProfiles.rating,
        wins: schema.gameProfiles.wins,
        losses: schema.gameProfiles.losses,
        draws: schema.gameProfiles.draws,
        streak: schema.gameProfiles.streak,
        provisional: schema.gameProfiles.provisional,
        campus: schema.gameProfiles.campus,
        city: schema.gameProfiles.city,
        gameKey: schema.games.key,
        gameName: schema.games.name,
      })
      .from(schema.gameProfiles)
      .innerJoin(schema.games, eq(schema.gameProfiles.gameId, schema.games.id))
      .innerJoin(schema.users, eq(schema.gameProfiles.userId, schema.users.id))
      .where(and(...conditions))
      .orderBy(desc(schema.gameProfiles.rating), desc(schema.gameProfiles.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const hasMore = rows.length > query.limit;
    const last = page[page.length - 1];

    return {
      items: page.map((row) => {
        const rankTier = rankTierForRating(row.rating);
        return {
          userId: row.userId,
          username: row.username ?? row.inGameId,
          game: { key: row.gameKey, name: row.gameName },
          inGameId: row.inGameId,
          rating: row.rating,
          rankTier,
          rankLabel: rankTierLabel(rankTier),
          provisional: row.provisional,
          wins: row.wins,
          losses: row.losses,
          draws: row.draws,
          streak: row.streak,
          record: `${row.wins}\u2013${row.losses}\u2013${row.draws}`,
          campus: row.campus,
          city: row.city,
          reputation: 'new' as const,
        };
      }),
      nextCursor:
        hasMore && last ? encodeCursor({ rating: last.rating, id: last.profileId }) : null,
    };
  }
}
