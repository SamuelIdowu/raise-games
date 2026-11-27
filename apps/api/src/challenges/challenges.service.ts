import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { and, desc, eq, gt, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { decodeCursor, encodeCursor } from '../shared/cursor';
import { escapeLike } from '../shared/like';
import { toChallengeCard, type ChallengeCardDto, type GroupMember } from './challenges.mapper';
import { canonicalPair, ratingGapBetween } from './pairing';
import { scheduleChallengeExpiry, cancelChallengeExpiry } from './challenges.queue';
import type { BoardQuery, CreateChallengeRequest } from './challenges.schemas';
import { v7 as uuidv7 } from 'uuid';
import { assertCanPlay } from '../moderation/standing';
import { WalletService } from '../wallet/wallet.service';

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
const ACCEPTANCE_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

/** Group members for these challenges, with display names, keyed by challenge id. */
async function groupsFor(challengeIds: string[]): Promise<Map<string, GroupMember[]>> {
  const out = new Map<string, GroupMember[]>();
  if (challengeIds.length === 0) return out;
  const rows = await db
    .select({
      challengeId: schema.challengeTargets.challengeId,
      userId: schema.challengeTargets.userId,
      username: schema.users.displayName,
      declinedAt: schema.challengeTargets.declinedAt,
    })
    .from(schema.challengeTargets)
    .innerJoin(schema.users, eq(schema.users.id, schema.challengeTargets.userId))
    .where(inArray(schema.challengeTargets.challengeId, challengeIds))
    .orderBy(schema.challengeTargets.createdAt);
  for (const r of rows) {
    const list = out.get(r.challengeId) ?? [];
    list.push({
      userId: r.userId,
      username: r.username ?? 'Player',
      declined: r.declinedAt !== null,
    });
    out.set(r.challengeId, list);
  }
  return out;
}

/** Group members of one challenge (empty for open and direct challenges). */
async function groupOf(challengeId: string) {
  return db
    .select({
      userId: schema.challengeTargets.userId,
      declinedAt: schema.challengeTargets.declinedAt,
    })
    .from(schema.challengeTargets)
    .where(eq(schema.challengeTargets.challengeId, challengeId));
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

@Injectable()
export class ChallengesService {
  constructor(private readonly wallet: WalletService) {}

  async listBoard(viewerId: string, query: BoardQuery): Promise<BoardResult> {
    const now = new Date();
    const mine = query.mine === 'true';
    const cursor = decodeCursor<BoardCursor>(query.cursor);
    const conditions = [];

    if (query.game) conditions.push(eq(schema.games.key, query.game));
    if (mine) {
      conditions.push(eq(schema.challenges.posterId, viewerId));
    } else if (query.forMe === 'true') {
      // Direct challenges to me, and group challenges I am in and have not declined.
      conditions.push(
        or(
          eq(schema.challenges.targetPlayerId, viewerId),
          sql`exists (select 1 from challenge_targets ct where ct.challenge_id = ${schema.challenges.id} and ct.user_id = ${viewerId} and ct.declined_at is null)`,
        ),
      );
    } else {
      // The public board: neither direct nor group challenges.
      conditions.push(isNull(schema.challenges.targetPlayerId));
      conditions.push(
        sql`not exists (select 1 from challenge_targets ct where ct.challenge_id = ${schema.challenges.id})`,
      );
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
        targetPlayerId: schema.challenges.targetPlayerId,
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

    const groups = await groupsFor(page.map((row) => row.id));
    return {
      items: page.map((row) => toChallengeCard(row, viewerId, now, groups.get(row.id))),
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
      needsActionCount: needsAction?.value ?? 0,
    };
  }

  async createChallenge(posterId: string, input: CreateChallengeRequest): Promise<{ id: string }> {
    const now = new Date();

    // Validate game and format
    const game = await db
      .select({ id: schema.games.id, key: schema.games.key })
      .from(schema.games)
      .where(eq(schema.games.key, input.gameKey))
      .limit(1);
    if (!game[0]) throw new NotFoundException(`Game not found: ${input.gameKey}`);

    const format = await db
      .select({ id: schema.gameFormats.id, key: schema.gameFormats.key })
      .from(schema.gameFormats)
      .where(
        and(
          eq(schema.gameFormats.gameId, game[0].id),
          eq(schema.gameFormats.key, input.formatKey),
          eq(schema.gameFormats.status, 'enabled'),
        ),
      )
      .limit(1);
    if (!format[0])
      throw new NotFoundException(`Format not found: ${input.formatKey} for game ${input.gameKey}`);

    // Validate time window
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (startsAt >= endsAt) throw new BadRequestException('startsAt must be before endsAt');
    if (startsAt <= now) throw new BadRequestException('startsAt must be in the future');

    // Idempotency check
    if (input.idempotencyKey) {
      const existing = await db
        .select({ id: schema.challenges.id })
        .from(schema.challenges)
        .where(
          and(
            eq(schema.challenges.posterId, posterId),
            eq(schema.challenges.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing[0]) return { id: existing[0].id };
    }

    // Who can accept: one player (direct), a group (first to accept plays), or anyone.
    // A one-player group is a direct challenge.
    const requested = input.targetPlayerIds ?? (input.targetPlayerId ? [input.targetPlayerId] : []);
    if (requested.includes(posterId)) throw new BadRequestException('Cannot challenge yourself');
    if (requested.length > 0) {
      const found = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(inArray(schema.users.id, requested));
      if (found.length !== requested.length) {
        throw new NotFoundException(
          requested.length === 1 ? 'Target player not found' : 'Some players were not found',
        );
      }
    }
    const targetPlayerId: string | null = requested.length === 1 ? requested[0]! : null;
    const groupIds: string[] = requested.length > 1 ? requested : [];

    // Check poster has a game profile for this game
    const posterProfile = await db
      .select({ id: schema.gameProfiles.id, rating: schema.gameProfiles.rating })
      .from(schema.gameProfiles)
      .where(
        and(eq(schema.gameProfiles.userId, posterId), eq(schema.gameProfiles.gameId, game[0].id)),
      )
      .limit(1);
    if (!posterProfile[0])
      throw new BadRequestException('Poster must have a game profile for this game');

    // Every invited player must play this game.
    if (requested.length > 0) {
      const withProfile = await db
        .select({ userId: schema.gameProfiles.userId })
        .from(schema.gameProfiles)
        .where(
          and(
            inArray(schema.gameProfiles.userId, requested),
            eq(schema.gameProfiles.gameId, game[0].id),
          ),
        );
      if (withProfile.length !== requested.length) {
        throw new BadRequestException(
          requested.length === 1
            ? 'Target player must have a game profile for this game'
            : 'Every player in the group must have a game profile for this game',
        );
      }
    }

    // Rate limit: max 5 open challenges per user
    const openCount = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.challenges)
      .where(and(eq(schema.challenges.posterId, posterId), eq(schema.challenges.status, 'open')));
    if ((openCount[0]?.value ?? 0) >= 5)
      throw new BadRequestException('Maximum 5 open challenges allowed');

    // Sanctions and fraud auto-limits (Sprint 12): suspended or limited players cannot post.
    await assertCanPlay(posterId);
    // Sprint 13: tier caps, restrictions and jurisdiction flags (a zero stake always passes
    // unless the currency is not allowed in the poster's state).
    await this.wallet.assertStake(posterId, input.stakeAmountMinor ?? 0, input.currency ?? 'NGN');

    const acceptanceDeadline = new Date(Date.now() + ACCEPTANCE_WINDOW_MS);
    const id = uuidv7();

    try {
      // The row and its outbox event commit together (transactional outbox).
      await db.transaction(async (tx) => {
        await tx.insert(schema.challenges).values({
          id,
          gameId: game[0]!.id,
          formatId: format[0]!.id,
          posterId,
          targetPlayerId,
          status: 'open',
          rules: input.rules ?? '',
          startsAt: startsAt,
          endsAt: endsAt,
          acceptanceDeadline,
          stakeAmountMinor: input.stakeAmountMinor ?? 0,
          currency: input.currency ?? 'NGN',
          feeScheduleVersion: 1,
          ratingGap: null,
          repeatPairCount: 0,
          version: 1,
          idempotencyKey: input.idempotencyKey ?? null,
          createdAt: now,
          updatedAt: now,
        });
        if (groupIds.length > 0) {
          await tx
            .insert(schema.challengeTargets)
            .values(groupIds.map((userId) => ({ challengeId: id, userId, createdAt: now })));
        }
        await tx.insert(schema.outboxEvents).values({
          id: uuidv7(),
          type: 'challenge.created',
          subjectId: id,
          payload: {
            challengeId: id,
            posterId,
            gameId: game[0]!.id,
            formatId: format[0]!.id,
            isDirect: requested.length > 0,
            targetPlayerId,
            targetPlayerIds: groupIds,
          },
        });
      });
    } catch (error) {
      // Two concurrent retries with the same idempotency key: the loser of the unique
      // index returns the winner's challenge instead of a 500.
      if (input.idempotencyKey && isUniqueViolation(error)) {
        const [existing] = await db
          .select({ id: schema.challenges.id })
          .from(schema.challenges)
          .where(
            and(
              eq(schema.challenges.posterId, posterId),
              eq(schema.challenges.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (existing) return { id: existing.id };
      }
      throw error;
    }

    // Schedule expiry job
    await scheduleChallengeExpiry(id, acceptanceDeadline);

    return { id };
  }

  async getChallenge(challengeId: string, viewerId?: string): Promise<ChallengeCardDto | null> {
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
        targetPlayerId: schema.challenges.targetPlayerId,
        rules: schema.challenges.rules,
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
      .where(eq(schema.challenges.id, challengeId))
      .limit(1);

    if (!rows[0]) return null;

    const row = rows[0];
    const now = new Date();

    // Include target info for detail view
    let targetInfo = null;
    if (row.targetPlayerId) {
      const target = await db
        .select({
          userId: schema.users.id,
          username: schema.users.displayName,
          inGameId: schema.gameProfiles.inGameId,
          rating: schema.gameProfiles.rating,
          wins: schema.gameProfiles.wins,
          losses: schema.gameProfiles.losses,
          draws: schema.gameProfiles.draws,
          provisional: schema.gameProfiles.provisional,
        })
        .from(schema.users)
        .innerJoin(
          schema.gameProfiles,
          and(
            eq(schema.gameProfiles.userId, schema.users.id),
            eq(schema.gameProfiles.gameId, row.gameId),
          ),
        )
        .where(eq(schema.users.id, row.targetPlayerId))
        .limit(1);
      if (target[0]) {
        targetInfo = {
          userId: target[0].userId,
          username: target[0].username ?? target[0].inGameId,
          rating: target[0].rating,
          wins: target[0].wins,
          losses: target[0].losses,
          draws: target[0].draws,
          provisional: target[0].provisional,
        };
      }
    }

    const group = (await groupsFor([row.id])).get(row.id);
    const card = toChallengeCard(row, viewerId ?? '', now, group);
    return {
      ...card,
      rules: row.rules,
      target: targetInfo,
    };
  }

  /**
   * Atomic accept (F6.3). One conditional UPDATE … WHERE status = 'open' AND the deadline
   * has not passed decides the winner: concurrent accepts serialise on the row lock and
   * every loser re-evaluates the WHERE, matches nothing, and gets 409. The match, sides,
   * participants, pairing counter and outbox events are written in the same transaction,
   * so a failure leaves no half-created match.
   *
   * Idempotent for the winner: a retry by the player who already accepted returns the
   * same match instead of 409.
   */
  async acceptChallenge(challengeId: string, acceptorId: string): Promise<{ matchId: string }> {
    const [c] = await db
      .select({
        id: schema.challenges.id,
        status: schema.challenges.status,
        posterId: schema.challenges.posterId,
        targetPlayerId: schema.challenges.targetPlayerId,
        acceptedById: schema.challenges.acceptedById,
        gameId: schema.challenges.gameId,
        startsAt: schema.challenges.startsAt,
        acceptanceDeadline: schema.challenges.acceptanceDeadline,
        stakeAmountMinor: schema.challenges.stakeAmountMinor,
        currency: schema.challenges.currency,
      })
      .from(schema.challenges)
      .where(eq(schema.challenges.id, challengeId))
      .limit(1);

    if (!c) throw new NotFoundException('Challenge not found');
    if (c.status === 'accepted' && c.acceptedById === acceptorId) {
      return { matchId: await this.matchIdFor(challengeId) };
    }
    if (c.posterId === acceptorId)
      throw new BadRequestException('Cannot accept your own challenge');
    if (c.targetPlayerId && c.targetPlayerId !== acceptorId) {
      throw new ForbiddenException('This challenge is for a specific player');
    }
    const group = await groupOf(challengeId);
    if (group.length > 0) {
      const me = group.find((g) => g.userId === acceptorId);
      if (!me) throw new ForbiddenException('This challenge is for a group you are not in');
      if (me.declinedAt) throw new ConflictException('You declined this challenge');
    }
    if (c.status !== 'open') throw new ConflictException('Challenge is not open');
    if (c.acceptanceDeadline <= new Date()) throw new ConflictException('Challenge has expired');
    // Sprint 12: suspended or auto-limited players cannot accept either.
    await assertCanPlay(acceptorId);
    // Sprint 13: the acceptor puts up the same stake, so their caps apply too.
    await this.wallet.assertStake(acceptorId, c.stakeAmountMinor, c.currency);

    const profiles = await db
      .select({ id: schema.gameProfiles.id, userId: schema.gameProfiles.userId })
      .from(schema.gameProfiles)
      .where(
        and(
          eq(schema.gameProfiles.gameId, c.gameId),
          or(
            eq(schema.gameProfiles.userId, c.posterId),
            eq(schema.gameProfiles.userId, acceptorId),
          ),
        ),
      );
    const posterProfile = profiles.find((p) => p.userId === c.posterId);
    const acceptorProfile = profiles.find((p) => p.userId === acceptorId);
    if (!acceptorProfile) {
      throw new BadRequestException('Acceptor must have a game profile for this game');
    }
    if (!posterProfile) throw new ConflictException('Poster no longer has a profile for this game');

    const now = new Date();
    const matchId = uuidv7();
    const won = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(schema.challenges)
        .set({
          status: 'accepted',
          acceptedById: acceptorId,
          acceptedAt: now,
          version: sql`${schema.challenges.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.challenges.id, challengeId),
            eq(schema.challenges.status, 'open'),
            gt(schema.challenges.acceptanceDeadline, now),
          ),
        )
        .returning({ id: schema.challenges.id });
      if (claimed.length === 0) return false;

      await tx.insert(schema.matches).values({
        id: matchId,
        challengeId,
        status: 'accepted',
        version: 1,
        acceptedAt: now,
        scheduledStartAt: c.startsAt,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(schema.matchSides).values([
        {
          id: uuidv7(),
          matchId,
          userId: c.posterId,
          gameProfileId: posterProfile.id,
          side: 0,
          isPoster: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv7(),
          matchId,
          userId: acceptorId,
          gameProfileId: acceptorProfile.id,
          side: 1,
          isAcceptor: true,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await tx.insert(schema.matchParticipants).values([
        {
          id: uuidv7(),
          matchId,
          userId: c.posterId,
          gameProfileId: posterProfile.id,
          createdAt: now,
        },
        {
          id: uuidv7(),
          matchId,
          userId: acceptorId,
          gameProfileId: acceptorProfile.id,
          createdAt: now,
        },
      ]);

      const { userAId, userBId } = canonicalPair(c.posterId, acceptorId);
      await tx
        .insert(schema.pairingCounters)
        .values({ id: uuidv7(), gameId: c.gameId, userAId, userBId, count: 1, lastPairingAt: now })
        .onConflictDoUpdate({
          target: [
            schema.pairingCounters.gameId,
            schema.pairingCounters.userAId,
            schema.pairingCounters.userBId,
          ],
          set: {
            count: sql`${schema.pairingCounters.count} + 1`,
            lastPairingAt: now,
            updatedAt: now,
          },
        });

      await tx.insert(schema.outboxEvents).values([
        {
          id: uuidv7(),
          type: 'challenge.accepted',
          subjectId: challengeId,
          payload: { challengeId, acceptorId, matchId },
        },
        {
          id: uuidv7(),
          type: 'match.created',
          subjectId: matchId,
          payload: { matchId, challengeId, participants: [c.posterId, acceptorId] },
        },
      ]);
      return true;
    });

    if (!won) {
      // Lost the race (or the deadline passed between read and write). A concurrent
      // retry by the player who did win still gets the match.
      const [latest] = await db
        .select({ status: schema.challenges.status, acceptedById: schema.challenges.acceptedById })
        .from(schema.challenges)
        .where(eq(schema.challenges.id, challengeId))
        .limit(1);
      if (latest?.status === 'accepted' && latest.acceptedById === acceptorId) {
        return { matchId: await this.matchIdFor(challengeId) };
      }
      throw new ConflictException(
        latest?.status === 'open' ? 'Challenge has expired' : 'Challenge is no longer open',
      );
    }

    await cancelChallengeExpiry(challengeId);
    return { matchId };
  }

  private async matchIdFor(challengeId: string): Promise<string> {
    const [m] = await db
      .select({ id: schema.matches.id })
      .from(schema.matches)
      .where(eq(schema.matches.challengeId, challengeId))
      .limit(1);
    if (!m) throw new ConflictException('Challenge is no longer open');
    return m.id;
  }

  /**
   * Decline (F6.3). A direct challenge closes (cancelled). An open-board challenge stays
   * open for others; the decline is only recorded as an event.
   */
  async declineChallenge(challengeId: string, userId: string): Promise<void> {
    const [c] = await db
      .select({
        id: schema.challenges.id,
        status: schema.challenges.status,
        posterId: schema.challenges.posterId,
        targetPlayerId: schema.challenges.targetPlayerId,
      })
      .from(schema.challenges)
      .where(eq(schema.challenges.id, challengeId))
      .limit(1);

    if (!c) throw new NotFoundException('Challenge not found');
    if (c.posterId === userId) throw new BadRequestException('Cannot decline your own challenge');
    if (c.targetPlayerId && c.targetPlayerId !== userId)
      throw new ForbiddenException('Not authorized');

    // Group: a member's decline removes only them; the last decline closes the challenge.
    const group = await groupOf(challengeId);
    if (group.length > 0) {
      const me = group.find((g) => g.userId === userId);
      if (!me) throw new ForbiddenException('Not authorized');
      if (me.declinedAt || c.status === 'cancelled') return; // retried decline
      if (c.status !== 'open') throw new ConflictException('Challenge is not open');
      const lastOne = group.every((g) => g.userId === userId || g.declinedAt !== null);
      const at = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(schema.challengeTargets)
          .set({ declinedAt: at })
          .where(
            and(
              eq(schema.challengeTargets.challengeId, challengeId),
              eq(schema.challengeTargets.userId, userId),
            ),
          );
        if (lastOne) {
          await tx
            .update(schema.challenges)
            .set({
              status: 'cancelled',
              cancelledAt: at,
              version: sql`${schema.challenges.version} + 1`,
              updatedAt: at,
            })
            .where(
              and(eq(schema.challenges.id, challengeId), eq(schema.challenges.status, 'open')),
            );
        }
        await tx.insert(schema.outboxEvents).values({
          id: uuidv7(),
          type: 'challenge.declined',
          subjectId: challengeId,
          payload: { challengeId, declinedBy: userId, closed: lastOne, group: true },
        });
      });
      if (lastOne) await cancelChallengeExpiry(challengeId);
      return;
    }

    // A retried decline of a direct challenge that is already closed is a no-op.
    if (c.targetPlayerId && c.status === 'cancelled') return;
    if (c.status !== 'open') throw new ConflictException('Challenge is not open');

    const closes = Boolean(c.targetPlayerId);
    await db.transaction(async (tx) => {
      if (closes) {
        const declined = await tx
          .update(schema.challenges)
          .set({
            status: 'cancelled',
            cancelledAt: new Date(),
            version: sql`${schema.challenges.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(schema.challenges.id, challengeId), eq(schema.challenges.status, 'open')))
          .returning({ id: schema.challenges.id });
        if (declined.length === 0) throw new ConflictException('Challenge is not open');
      }
      await tx.insert(schema.outboxEvents).values({
        id: uuidv7(),
        type: 'challenge.declined',
        subjectId: challengeId,
        payload: { challengeId, declinedBy: userId, closed: closes },
      });
    });

    if (closes) await cancelChallengeExpiry(challengeId);
  }

  /**
   * Cancel by the poster (F6.3). Free before acceptance. After acceptance it is a late
   * cancel: the match is cancelled too and a reputation-debt event is recorded for the
   * Sprint 12 reputation engine. Once a result has been submitted the match can no longer
   * be cancelled; that is a dispute or a no-show report instead.
   */
  async cancelChallenge(challengeId: string, userId: string): Promise<void> {
    const [c] = await db
      .select({
        id: schema.challenges.id,
        status: schema.challenges.status,
        posterId: schema.challenges.posterId,
      })
      .from(schema.challenges)
      .where(eq(schema.challenges.id, challengeId))
      .limit(1);

    if (!c) throw new NotFoundException('Challenge not found');
    if (c.posterId !== userId) throw new ForbiddenException('Only the poster can cancel');
    if (c.status === 'cancelled') return; // retried cancel
    if (c.status !== 'open' && c.status !== 'accepted') {
      throw new ConflictException('Can only cancel open or accepted challenges');
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ status: schema.challenges.status })
        .from(schema.challenges)
        .where(eq(schema.challenges.id, challengeId))
        .for('update');
      if (!locked || (locked.status !== 'open' && locked.status !== 'accepted')) {
        throw new ConflictException('Challenge was modified by another request');
      }
      const isLateCancel = locked.status === 'accepted';

      let matchId: string | null = null;
      if (isLateCancel) {
        const cancelledMatch = await tx
          .update(schema.matches)
          .set({
            status: 'cancelled',
            cancelledAt: now,
            version: sql`${schema.matches.version} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.matches.challengeId, challengeId),
              inArray(schema.matches.status, ['accepted', 'in_progress']),
            ),
          )
          .returning({ id: schema.matches.id });
        if (cancelledMatch.length === 0) {
          throw new ConflictException(
            'The match is already being played. Report a no-show or open a dispute instead.',
          );
        }
        matchId = cancelledMatch[0]!.id;
      }

      await tx
        .update(schema.challenges)
        .set({
          status: 'cancelled',
          cancelledAt: now,
          version: sql`${schema.challenges.version} + 1`,
          updatedAt: now,
        })
        .where(eq(schema.challenges.id, challengeId));

      await tx.insert(schema.outboxEvents).values([
        {
          id: uuidv7(),
          type: 'challenge.cancelled',
          subjectId: challengeId,
          payload: { challengeId, cancelledBy: userId, lateCancel: isLateCancel, matchId },
        },
        ...(matchId
          ? [
              {
                id: uuidv7(),
                type: 'match.cancelled',
                subjectId: matchId,
                payload: { matchId, challengeId, cancelledBy: userId },
              },
              {
                id: uuidv7(),
                type: 'reputation.debt',
                subjectId: userId,
                payload: { userId, reason: 'late_cancel', challengeId, matchId },
              },
            ]
          : []),
      ]);
    });

    await cancelChallengeExpiry(challengeId);
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
