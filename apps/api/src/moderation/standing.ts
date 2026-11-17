import { ForbiddenException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  ESCALATION_WINDOW_MS,
  evaluateEscalation,
  restrictionsOf,
  type EscalationCounts,
  type EscalationSignal,
  type SanctionType,
} from './ladder';

export interface Standing {
  /** The most severe active sanction, if any (warnings are never active). */
  sanction: { id: string; type: SanctionType; step: number | null; endsAt: string | null } | null;
  loginBlocked: boolean;
  playBlocked: boolean;
  autoLimit: { limited: boolean; reasons: EscalationSignal[]; counts: EscalationCounts };
  /** True when the player may create and accept challenges. */
  canPlay: boolean;
}

const SEVERITY: Record<SanctionType, number> = {
  warning: 0,
  suspension: 1,
  temporary_ban: 2,
  permanent_ban: 3,
};

/**
 * Account standing (Sprint 12, F12.3/F12.4): active sanction + fraud auto-limit, from one
 * query. Signals count from the later of 30 days ago and the last moderator clear.
 */
export async function getStanding(userId: string, now: Date = new Date()): Promise<Standing> {
  const windowStart = new Date(now.getTime() - ESCALATION_WINDOW_MS);
  const { rows } = await db.execute<{
    sanctions: Array<{
      id: string;
      type: SanctionType;
      step: number | null;
      ends_at: string | null;
    }> | null;
    reused: number;
    reports: number;
    lost: number;
    debts: number;
  }>(sql`
    WITH since AS (
      SELECT greatest(${windowStart}::timestamptz, coalesce(u.fraud_cleared_at, '-infinity'::timestamptz)) AS t
      FROM users u WHERE u.id = ${userId}
    )
    SELECT
      (SELECT json_agg(json_build_object('id', s.id, 'type', s.type, 'step', s.step, 'ends_at', s.ends_at))
         FROM sanctions s
         WHERE s.user_id = ${userId} AND s.revoked_at IS NULL AND s.starts_at <= ${now}
           AND (s.ends_at IS NULL OR s.ends_at > ${now})) AS sanctions,
      (SELECT count(*)::int FROM uploads up, since
         WHERE up.owner_id = ${userId} AND up.status = 'rejected'
           AND up.reject_reason = 'reused_screenshot' AND up.created_at > since.t) AS reused,
      (SELECT count(*)::int FROM reports r, since
         WHERE r.status = 'actioned' AND r.resolved_at > since.t
           AND ((r.subject_type = 'user' AND r.subject_id = ${userId})
             OR (r.subject_type = 'challenge' AND r.subject_id IN
                   (SELECT c.id FROM challenges c WHERE c.poster_id = ${userId})))) AS reports,
      (SELECT count(*)::int FROM disputes d
         JOIN matches m ON m.id = d.match_id
         JOIN match_sides ms ON ms.match_id = m.id AND ms.user_id = ${userId}, since
         WHERE d.raised_by_id = ${userId} AND d.status IN ('ruled','final')
           AND d.ruled_at > since.t AND m.winner_side IS NOT NULL AND m.winner_side <> ms.side) AS lost,
      (SELECT count(*)::int FROM reputation_debts rd, since
         WHERE rd.user_id = ${userId} AND rd.created_at > since.t) AS debts
  `);
  const row = rows[0];
  const active = (row?.sanctions ?? [])
    .filter((s) => s.type !== 'warning')
    .sort((a, b) => SEVERITY[b.type] - SEVERITY[a.type])[0];
  const counts: EscalationCounts = {
    reusedScreenshots: Number(row?.reused ?? 0),
    actionedReports: Number(row?.reports ?? 0),
    disputesLostAsOpener: Number(row?.lost ?? 0),
    reputationDebts: Number(row?.debts ?? 0),
  };
  const autoLimit = { ...evaluateEscalation(counts), counts };
  const restrictions = restrictionsOf(active?.type ?? null);
  return {
    sanction: active
      ? { id: active.id, type: active.type, step: active.step, endsAt: active.ends_at }
      : null,
    loginBlocked: restrictions.loginBlocked,
    playBlocked: restrictions.playBlocked,
    autoLimit,
    canPlay: !restrictions.playBlocked && !autoLimit.limited,
  };
}

export const STANDING_MESSAGES = {
  suspended: 'Your account is suspended, so you cannot create or accept challenges right now.',
  limited: 'New challenges are paused on your account while a moderator reviews recent activity.',
} as const;

/** Throws a 403 with plain, non-shaming copy when the player may not start new play. */
export async function assertCanPlay(userId: string): Promise<void> {
  const standing = await getStanding(userId);
  if (standing.playBlocked) throw new ForbiddenException(STANDING_MESSAGES.suspended);
  if (standing.autoLimit.limited) throw new ForbiddenException(STANDING_MESSAGES.limited);
}
