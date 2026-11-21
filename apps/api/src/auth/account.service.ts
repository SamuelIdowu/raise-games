import { createHmac } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { env } from '../config/env.instance';
import { db, schema } from '../db/client';
import { getStanding } from '../moderation/standing';

/** Matches that are still being played or decided: deletion waits for them. */
const UNFINISHED = [
  'accepted',
  'in_progress',
  'awaiting_result',
  'awaiting_confirmation',
  'disputed',
] as const;

export const ACCOUNT_COPY = {
  unfinished:
    'Finish or resolve your open matches first. You can delete your account once none are in progress or disputed.',
  sanctioned:
    'This account cannot be deleted while a suspension or ban is active. Contact support if you think this is wrong.',
  confirm: 'Type your username exactly to confirm.',
} as const;

/**
 * Phones are kept only as a keyed hash after deletion: moderators can still link a returning
 * banned player (Sprint 12 fraud signals) without the platform keeping the number.
 */
export function phoneFingerprint(phone: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(`phone:${phone}`).digest('hex');
}

/**
 * Account deletion and data export (audit B28; Nigeria Data Protection Act rights of access
 * and erasure). Deletion removes what identifies the player and keeps the match history
 * other players' ratings depend on, under a "Deleted player" name. Retention periods for
 * screenshots and chat are a separate owner decision.
 */
@Injectable()
export class AccountService {
  /** Everything the platform holds about the player, as one JSON document. */
  async exportData(userId: string) {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!user || user.deletedAt) throw new NotFoundException('Account not found');

    const [profiles, consents, sides, submissions, disputes, messages, sanctions] =
      await Promise.all([
        db
          .select({
            game: schema.games.name,
            inGameId: schema.gameProfiles.inGameId,
            city: schema.gameProfiles.city,
            campus: schema.gameProfiles.campus,
            rating: schema.gameProfiles.rating,
            ratedMatches: schema.gameProfiles.ratedMatches,
          })
          .from(schema.gameProfiles)
          .innerJoin(schema.games, eq(schema.games.id, schema.gameProfiles.gameId))
          .where(eq(schema.gameProfiles.userId, userId)),
        db
          .select({
            type: schema.consentRecords.termsType,
            version: schema.consentRecords.termsVersion,
            acceptedAt: schema.consentRecords.acceptedAt,
          })
          .from(schema.consentRecords)
          .where(eq(schema.consentRecords.userId, userId)),
        db
          .select({
            matchId: schema.matches.id,
            status: schema.matches.status,
            side: schema.matchSides.side,
            winnerSide: schema.matches.winnerSide,
            createdAt: schema.matches.createdAt,
          })
          .from(schema.matchSides)
          .innerJoin(schema.matches, eq(schema.matches.id, schema.matchSides.matchId))
          .where(eq(schema.matchSides.userId, userId))
          .orderBy(desc(schema.matches.createdAt)),
        db
          .select({
            matchId: schema.resultSubmissions.matchId,
            kind: schema.resultSubmissions.kind,
            result: schema.resultSubmissions.result,
            submittedAt: schema.resultSubmissions.submittedAt,
          })
          .from(schema.resultSubmissions)
          .where(eq(schema.resultSubmissions.submitterId, userId)),
        db
          .select({
            id: schema.disputes.id,
            matchId: schema.disputes.matchId,
            status: schema.disputes.status,
            createdAt: schema.disputes.createdAt,
          })
          .from(schema.disputes)
          .where(eq(schema.disputes.raisedById, userId)),
        db
          .select({ body: schema.messages.body, createdAt: schema.messages.createdAt })
          .from(schema.messages)
          .where(eq(schema.messages.senderId, userId))
          .orderBy(desc(schema.messages.createdAt))
          .limit(5000),
        db
          .select({
            type: schema.sanctions.type,
            reason: schema.sanctions.reason,
            createdAt: schema.sanctions.createdAt,
            endsAt: schema.sanctions.endsAt,
          })
          .from(schema.sanctions)
          .where(eq(schema.sanctions.userId, userId)),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        phone: user.phone,
        username: user.displayName,
        email: user.email,
        emailConfirmed: Boolean(user.emailVerifiedAt),
        state: user.jurisdictionState,
        identityTier: user.identityTier,
        createdAt: user.createdAt,
      },
      gameProfiles: profiles,
      consents,
      matches: sides,
      resultSubmissions: submissions,
      disputesOpened: disputes,
      messagesSent: messages,
      sanctions,
    };
  }

  /**
   * Deletes the account. Refused while a match is unfinished or a suspension or ban is
   * active (deleting must not end a dispute or dodge a sanction). Everything happens in one
   * transaction: identity scrubbed, sessions revoked, open challenges cancelled, push
   * subscriptions and pending requests removed, audit row written.
   */
  async deleteAccount(userId: string, confirmUsername: string, ip?: string) {
    const standing = await getStanding(userId);
    if (standing.sanction && standing.sanction.type !== 'warning') {
      throw new ConflictException(ACCOUNT_COPY.sanctioned);
    }
    return db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .for('update');
      if (!user || user.deletedAt) throw new NotFoundException('Account not found');
      if ((user.displayName ?? '') !== confirmUsername.trim()) {
        throw new ConflictException(ACCOUNT_COPY.confirm);
      }

      const [live] = await tx
        .select({ id: schema.matches.id })
        .from(schema.matchSides)
        .innerJoin(schema.matches, eq(schema.matches.id, schema.matchSides.matchId))
        .where(
          and(
            eq(schema.matchSides.userId, userId),
            inArray(schema.matches.status, [...UNFINISHED]),
          ),
        )
        .limit(1);
      if (live) throw new ConflictException(ACCOUNT_COPY.unfinished);

      const now = new Date();
      // Challenges this player posted that nobody accepted yet.
      const cancelled = await tx
        .update(schema.challenges)
        .set({
          status: 'cancelled',
          version: sql`${schema.challenges.version} + 1`,
          updatedAt: now,
        })
        .where(and(eq(schema.challenges.posterId, userId), eq(schema.challenges.status, 'open')))
        .returning({ id: schema.challenges.id });
      if (cancelled.length) {
        await tx.insert(schema.outboxEvents).values(
          cancelled.map((c) => ({
            id: uuidv7(),
            type: 'challenge.cancelled',
            subjectId: c.id,
            payload: { challengeId: c.id, by: userId, reason: 'account_deleted' },
          })),
        );
      }

      await tx
        .update(schema.users)
        .set({
          // The number is freed so the person can sign up again later; the unique index needs
          // a placeholder, and the fingerprint below keeps fraud linking possible.
          phone: `deleted:${userId}`,
          displayName: null,
          email: null,
          emailVerifiedAt: null,
          mfaSecretEnc: null,
          deletedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.users.id, userId));
      await tx
        .update(schema.gameProfiles)
        .set({ inGameId: 'deleted', city: null, campus: null })
        .where(eq(schema.gameProfiles.userId, userId));
      await tx
        .update(schema.sessions)
        .set({ revokedAt: now })
        .where(and(eq(schema.sessions.userId, userId), isNull(schema.sessions.revokedAt)));
      await tx.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
      await tx
        .delete(schema.emailVerifications)
        .where(eq(schema.emailVerifications.userId, userId));
      await tx
        .delete(schema.friendRequests)
        .where(
          and(
            eq(schema.friendRequests.status, 'pending'),
            or(
              eq(schema.friendRequests.requesterId, userId),
              eq(schema.friendRequests.addresseeId, userId),
            ),
          ),
        );
      await tx.insert(schema.auditLog).values({
        id: uuidv7(),
        actorId: userId,
        action: 'account.deleted',
        objectType: 'user',
        objectId: userId,
        after: {
          phoneFingerprint: phoneFingerprint(user.phone),
          cancelledChallenges: cancelled.length,
        },
        ip: ip ?? null,
      });
      return { deleted: true as const };
    });
  }
}
