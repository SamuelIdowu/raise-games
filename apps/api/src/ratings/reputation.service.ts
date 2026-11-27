import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { REPUTATION_WINDOW, reputationLevel, type ReputationLevel } from './reputation';

/**
 * Computes reputation for many players in one query (leaderboard pages, match rooms).
 *
 * Per player, over their last REPUTATION_WINDOW accepted matches:
 * - finished: confirmed, resolved or forfeited.
 * - completed: confirmed or resolved, or forfeited where they were the winner (an
 *   opponent no-show never counts against the player who showed up).
 * - disputesLost: resolved by a ruling with the other side as winner.
 * - late cancels (Sprint 12 reputation debts, last 90 days) count as matches the player
 *   did not complete.
 * Voided, cancelled and still-live matches are otherwise ignored.
 */
@Injectable()
export class ReputationService {
  async forUsers(userIds: string[]): Promise<Map<string, ReputationLevel>> {
    const unique = [...new Set(userIds)];
    const out = new Map<string, ReputationLevel>();
    if (unique.length === 0) return out;

    const ids = sql.join(
      unique.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const rows = await db.execute<{
      user_id: string;
      finished: number;
      completed: number;
      disputes_lost: number;
      active_sanction: boolean;
      recent_sanction: boolean;
    }>(sql`
      WITH recent AS (
        SELECT s.user_id, s.side, m.status, m.winner_side,
               row_number() OVER (PARTITION BY s.user_id ORDER BY m.accepted_at DESC) AS rn
        FROM match_sides s
        JOIN matches m ON m.id = s.match_id
        WHERE s.user_id IN (${ids})
      )
      SELECT u.id AS user_id,
        (count(*) FILTER (WHERE r.status IN ('confirmed','resolved','forfeited'))
          + (SELECT count(*) FROM reputation_debts rd
               WHERE rd.user_id = u.id AND rd.reason = 'late_cancel'
                 AND rd.created_at > now() - interval '90 days'))::int AS finished,
        count(*) FILTER (
          WHERE r.status IN ('confirmed','resolved')
             OR (r.status = 'forfeited' AND r.winner_side = r.side)
        )::int AS completed,
        count(*) FILTER (
          WHERE r.status = 'resolved' AND r.winner_side IS NOT NULL AND r.winner_side <> r.side
        )::int AS disputes_lost,
        EXISTS (
          SELECT 1 FROM sanctions x
          WHERE x.user_id = u.id AND x.revoked_at IS NULL AND x.starts_at <= now()
            AND (x.ends_at IS NULL OR x.ends_at > now())
        ) AS active_sanction,
        EXISTS (
          SELECT 1 FROM sanctions x
          WHERE x.user_id = u.id AND x.revoked_at IS NULL
            AND x.starts_at > now() - interval '90 days'
        ) AS recent_sanction
      FROM users u
      LEFT JOIN recent r ON r.user_id = u.id AND r.rn <= ${REPUTATION_WINDOW}
      WHERE u.id IN (${ids})
      GROUP BY u.id
    `);
    for (const row of rows.rows) {
      out.set(
        row.user_id,
        reputationLevel({
          finished: Number(row.finished),
          completed: Number(row.completed),
          disputesLost: Number(row.disputes_lost),
          activeSanction: row.active_sanction,
          sanctionInLast90Days: row.recent_sanction,
        }),
      );
    }
    return out;
  }
}
