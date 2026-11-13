import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, ilike, isNull, lt, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { decodeCursor, encodeCursor } from '../shared/cursor';
import { escapeLike } from '../shared/like';
import { toChallengeCard, type ChallengeCardDto } from './challenges.mapper';
import { canonicalPair, ratingGapBetween } from './pairing';
import type { BoardQuery } from './challenges.schemas';

interface BoardCursor {
  createdAt: string;
  id: string;
}

export interface BoardResult {
  items: ChallengeCardDto[];
  nextCursor: string | null;
  needsActionCount: number;
}

const NEEDS_ACTION_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ChallengesService {
  async listBoard(viewerId: string, query: BoardQuery): Promise<BoardResult> {
    const now = new Date();
    const mine = query.mine === 'true';
    const cursor = decodeCursor<BoardCursor>(query.cursor);
    const conditions = [];

    if (query.game) conditions.push(eq(schema.games.key, query.game));
    if (mine) {
      conditions.push(eq(schema.challenges.posterId, viewerId));
    } else {
      conditions.push(isNull(schema.challenges.targetPlayerId));
    }
    if (query.status === 'open') {
      conditions.push(eq(schema.challenges.status, 'open'));
      conditions.push(gt(schema.challenges.acceptanceDeadline, now));
    }
    if (query.campus) {
      conditions.push(ilike(schema.gameProfiles.campus, `%${escapeLike(query.campus)}%`));
    }
    if (query.city) {
      conditions.push(ilike(schema.gameProfiles.city, `%${escapeLike(query.city)}%`));
    }
    if (cursor) {
      const at = new Date(cursor.createdAt);
      conditions.push(
        or(
          lt(schema.challenges.createdAt, at),
          and(eq(schema.challenges.createdAt, at), lt(schema.challenges.id, cursor.id)),
        ),
      );
    }

    const rows = await db
      .select({
        id: schema.challenges.id,
        status: schema.challenges.status,
        createdAt: schema.challenges.createdAt,
        startsAt: schema.challenges.startsAt,
        endsAt: schema.challenges.endsAt,
        acceptanceDeadline: schema.challenges.acceptanceDeadline,
        stakeAmountMinor: schema.challenges.stakeAmountMinor,
        currency: schema.challenges.currency,
        ratingGap: schema.challenges.ratingGap,
        posterId: schema.challenges.posterId,
        gameId: schema.games.id,
        gameKey: schema.games.key,
        gameName: schema.games.name,
        formatId: schema.gameFormats.id,
        formatKey: schema.gameFormats.key,
        formatName: schema.gameFormats.name,
        username: schema.users.displayName,
        inGameId: schema.gameProfiles.inGameId,
        rating: schema.gameProfiles.rating,
        wins: schema.gameProfiles.wins,
        losses: schema.gameProfiles.losses,
        draws: schema.gameProfiles.draws,
        provisional: schema.gameProfiles.provisional,
      })
      .from(schema.challenges)
      .innerJoin(schema.games, eq(schema.challenges.gameId, schema.games.id))
      .innerJoin(schema.gameFormats, eq(schema.challenges.formatId, schema.gameFormats.id))
      .innerJoin(schema.users, eq(schema.challenges.posterId, schema.users.id))
      .innerJoin(
        schema.gameProfiles,
        and(
          eq(schema.gameProfiles.userId, schema.challenges.posterId),
          eq(schema.gameProfiles.gameId, schema.challenges.gameId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(schema.challenges.createdAt), desc(schema.challenges.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const hasMore = rows.length > query.limit;
    const last = page[page.length - 1];

    const [needsAction] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.challenges)
      .where(
        and(
          eq(schema.challenges.posterId, viewerId),
          eq(schema.challenges.status, 'open'),
          gt(schema.challenges.acceptanceDeadline, now),
          lt(
            schema.challenges.acceptanceDeadline,
            new Date(now.getTime() + NEEDS_ACTION_WINDOW_MS),
          ),
        ),
      );

    return {
      items: page.map((row) => toChallengeCard(row, viewerId, now)),
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
      needsActionCount: needsAction?.value ?? 0,
    };
  }

  async computeFairnessSignals(input: {
    gameId: string;
    posterId: string;
    opponentId: string;
    posterRating: number;
    opponentRating: number;
  }): Promise<{ ratingGap: number; repeatPairCount: number }> {
    const { userAId, userBId } = canonicalPair(input.posterId, input.opponentId);
    const [counter] = await db
      .select({ count: schema.pairingCounters.count })
      .from(schema.pairingCounters)
      .where(
        and(
          eq(schema.pairingCounters.gameId, input.gameId),
          eq(schema.pairingCounters.userAId, userAId),
          eq(schema.pairingCounters.userBId, userBId),
        ),
      )
      .limit(1);

    return {
      ratingGap: ratingGapBetween(input.posterRating, input.opponentRating),
      repeatPairCount: counter?.count ?? 0,
    };
  }
}
