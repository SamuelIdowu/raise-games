import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { cursorSchemas, decodeCursor, encodeCursor } from '../shared/cursor';
import { rankTierForRating, rankTierLabel } from '../shared/ranks';
import { ReputationService } from './reputation.service';
import type { ReputationLevel } from './reputation';
import type { LeaderboardQuery } from './leaderboards.schemas';

export interface LeaderboardRow {
  rank: number;
  userId: string;
  username: string;
  rating: number;
  provisional: boolean;
  rankTier: string;
  rankLabel: string;
  wins: number;
  losses: number;
  draws: number;
  ratedMatches: number;
  campus: string | null;
  city: string | null;
  /** Rating change over the last 7 days; direction always travels with a label in the UI. */
  trend: { delta: number; direction: 'up' | 'down' | 'flat' };
  reputation: ReputationLevel;
}

export interface LeaderboardPage {
  game: { key: string; name: string };
  /** Latest rating event for this game; unchanged version = unchanged board. */
  version: number;
  items: LeaderboardRow[];
  nextCursor: string | null;
  /** The viewer's own row (pinned in the UI when it is off-screen), if they are ranked. */
  me: LeaderboardRow | null;
}

type BoardRow = {
  user_id: string;
  username: string;
  rating: number;
  provisional: boolean;
  wins: number;
  losses: number;
  draws: number;
  rated_matches: number;
  campus: string | null;
  city: string | null;
  rank: number;
  pos: number;
};

/**
 * Leaderboards (Sprint 10, F10.3). PRD acceptance: leaderboards count confirmed matches
 * only. Ratings only ever change from confirmed, forfeited or ruled results, so a
 * profile appears once it has at least one rated match; pending and disputed matches
 * never reach it. Provisional players are listed and flagged (Design §8 badge), not hidden.
 */
@Injectable()
export class LeaderboardsService {
  constructor(private readonly reputation: ReputationService) {}

  async page(gameKey: string, viewerId: string, query: LeaderboardQuery): Promise<LeaderboardPage> {
    const [game] = await db
      .select({ id: schema.games.id, key: schema.games.key, name: schema.games.name })
      .from(schema.games)
      .where(eq(schema.games.key, gameKey))
      .limit(1);
    if (!game) throw new NotFoundException('Game not found');

    const filters: SQL[] = [];
    if (query.campus) filters.push(sql`lower(gp.campus) = lower(${query.campus})`);
    if (query.city) filters.push(sql`lower(gp.city) = lower(${query.city})`);
    const extra = filters.length ? sql` AND ${sql.join(filters, sql` AND `)}` : sql``;

    // Competition ranking ("1, 2, 2, 4") on rating; `pos` is a stable total order for paging.
    const board = sql`
      WITH board AS (
        SELECT gp.user_id, coalesce(u.display_name, gp.in_game_id) AS username,
               gp.rating, gp.provisional, gp.wins, gp.losses, gp.draws, gp.rated_matches,
               gp.campus, gp.city,
               rank() OVER (ORDER BY gp.rating DESC)::int AS rank,
               row_number() OVER (ORDER BY gp.rating DESC, gp.id)::int AS pos
        FROM game_profiles gp
        JOIN users u ON u.id = gp.user_id
        WHERE gp.game_id = ${game.id} AND gp.rated_matches > 0 AND u.deleted_at IS NULL${extra}
      )`;

    const after = decodeCursor(query.cursor, cursorSchemas.position)?.p ?? 0;
    const pageRows = (
      await db.execute<BoardRow>(sql`${board}
        SELECT * FROM board WHERE pos > ${after} ORDER BY pos LIMIT ${query.limit + 1}`)
    ).rows;
    const meRows = (
      await db.execute<BoardRow>(sql`${board} SELECT * FROM board WHERE user_id = ${viewerId}`)
    ).rows;

    const hasMore = pageRows.length > query.limit;
    const rows = pageRows.slice(0, query.limit);
    const people = [...rows, ...meRows];
    const userIds = people.map((r) => r.user_id);

    const trends = new Map<string, number>();
    if (userIds.length) {
      const t = await db.execute<{ user_id: string; delta: number }>(sql`
        SELECT user_id, coalesce(sum(delta), 0)::int AS delta
        FROM rating_events
        WHERE game_id = ${game.id}
          AND created_at > now() - interval '7 days'
          AND user_id IN (${sql.join(
            userIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
        GROUP BY user_id`);
      for (const row of t.rows) trends.set(row.user_id, Number(row.delta));
    }
    const reps = await this.reputation.forUsers(userIds);
    const [v] = (
      await db.execute<{ v: number | null }>(
        sql`SELECT max(seq)::bigint AS v FROM rating_events WHERE game_id = ${game.id}`,
      )
    ).rows;

    const toRow = (r: BoardRow): LeaderboardRow => {
      const tier = rankTierForRating(r.rating);
      const delta = trends.get(r.user_id) ?? 0;
      return {
        rank: Number(r.rank),
        userId: r.user_id,
        username: r.username,
        rating: Number(r.rating),
        provisional: r.provisional,
        rankTier: tier,
        rankLabel: rankTierLabel(tier),
        wins: Number(r.wins),
        losses: Number(r.losses),
        draws: Number(r.draws),
        ratedMatches: Number(r.rated_matches),
        campus: r.campus,
        city: r.city,
        trend: { delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' },
        reputation: reps.get(r.user_id) ?? 'new',
      };
    };

    const last = rows[rows.length - 1];
    return {
      game: { key: game.key, name: game.name },
      version: Number(v?.v ?? 0),
      items: rows.map(toRow),
      nextCursor: hasMore && last ? encodeCursor({ p: Number(last.pos) }) : null,
      me: meRows[0] ? toRow(meRows[0]) : null,
    };
  }
}
