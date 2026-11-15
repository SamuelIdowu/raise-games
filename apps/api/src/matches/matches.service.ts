import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { roomCodeModeFor } from '../games/room-code-mode';
import { db, schema } from '../db/client';
import type { AuthedUser } from '../auth/jwt-auth.guard';
import { rankTierForRating, rankTierLabel } from '../shared/ranks';
import {
  canSeeRoomCode,
  chatLocksAt,
  completedAt,
  isChatLocked,
  type MatchStatus,
  type MatchTimestamps,
} from '../chat/chat.rules';
import {
  NO_SHOW_GATE_MS,
  RESULT_WINDOW_MS,
  deadlineFromRow,
  nextActionFor,
  requiredProofColumn,
  resultSchemaColumn,
  type DeadlineKind,
  type NextAction,
  type RequiredProof,
} from './matches.rules';

export interface SubmissionView {
  kind: 'result' | 'no_show' | 'confirmation';
  outcome: 'win' | 'loss' | 'draw' | 'no_show';
  score: { self: number; opponent: number } | null;
  note: string | null;
  submittedAt: string;
  uploadId: string | null;
}

export interface MatchPlayerDto {
  userId: string;
  username: string;
  rating: number;
  rankTier: string;
  rankLabel: string;
  provisional: boolean;
  record: string;
  /** Reputation scoring lands in Sprint 10; every player reads "new" until then. */
  reputation: 'new';
  gameId: string;
  /** Same as gameId (Sprint 8 components read this name). */
  inGameId: string;
  wins: number;
  losses: number;
  draws: number;
  side: number;
  isPoster: boolean;
  /** When this player submitted a result (Sprint 8 writes it); drives the hub CTA. */
  submittedAt: string | null;
  /** This player's first-revision submission, if any (Sprint 8). */
  submission: SubmissionView | null;
}

export interface MatchViewDto {
  id: string;
  challengeId: string;
  status: MatchStatus;
  version: number;
  game: { key: string; name: string };
  format: {
    key: string;
    name: string;
    resultSchema: {
      outcomeOptions: ('win' | 'loss' | 'draw')[];
      scoreModel: 'goals' | 'kills' | 'placement' | 'points';
      drawAllowed: boolean;
    };
    requiredProof: RequiredProof;
  };
  rules: string;
  timeWindow: { startsAt: string; endsAt: string };
  acceptedAt: string;
  resultSubmittedAt: string | null;
  /** When the match reached its final outcome (starts the 72h chat-lock clock). */
  completedAt: string | null;
  deadline: { kind: DeadlineKind; at: string } | null;
  /** The viewer, when they are a participant. Null for moderators viewing as staff. */
  me: MatchPlayerDto | null;
  players: MatchPlayerDto[];
  /** The other player, for a participant viewer. */
  opponent: MatchPlayerDto | null;
  agreedStartAt: string;
  resultDeadline: string;
  noShowAvailableAt: string;
  confirmationDeadline: string | null;
  winnerSide: number | null;
  decidedVia: string | null;
  /** Win/Loss tags appear only on finished matches (Design §7). */
  outcomeForViewer: 'win' | 'loss' | 'draw' | null;
  nextAction: NextAction;
  /** Filled by Sprint 10's rating events; null until then. */
  ratingDelta: number | null;
  confirmedAt: string | null;
  /** Only set for participants while the match is live (F6.5 / F7.2). */
  roomCode: string | null;
  /** Per-game room-code exchange (games.json): 'none' | 'optional' | 'required'. */
  roomCodeMode: 'none' | 'optional' | 'required';
  /** True when the viewer may set or change the room code now. */
  canSetRoomCode: boolean;
  chat: { locked: boolean; locksAt: string | null };
  viewerRole: 'participant' | 'staff';
}

export interface MatchAccess {
  match: typeof schema.matches.$inferSelect;
  participantIds: string[];
  isParticipant: boolean;
}

@Injectable()
export class MatchesService {
  /**
   * Loads a match and decides whether the viewer may see it. Participants always may;
   * moderators and admins may as staff (dispute evidence, F7.4). Everyone else gets 404
   * rather than 403 so match ids cannot be probed.
   */
  async access(matchId: string, viewer: AuthedUser): Promise<MatchAccess> {
    const [match] = await db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId))
      .limit(1);
    if (!match) throw new NotFoundException('Match not found');

    const sides = await db
      .select({ userId: schema.matchSides.userId })
      .from(schema.matchSides)
      .where(eq(schema.matchSides.matchId, matchId));
    const participantIds = sides.map((s) => s.userId);
    const isParticipant = participantIds.includes(viewer.sub);
    const isStaff = viewer.role === 'moderator' || viewer.role === 'admin';
    if (!isParticipant && !isStaff) throw new NotFoundException('Match not found');

    return { match, participantIds, isParticipant };
  }

  /** Participant-only variant for actions staff must not take (sending chat, etc.). */
  async requireParticipant(matchId: string, viewer: AuthedUser): Promise<MatchAccess> {
    const access = await this.access(matchId, viewer);
    if (!access.isParticipant) throw new ForbiddenException('Only match participants can do this');
    return access;
  }

  async getView(
    matchId: string,
    viewer: AuthedUser,
    now: Date = new Date(),
  ): Promise<MatchViewDto> {
    const { match, isParticipant } = await this.access(matchId, viewer);

    const [challenge] = await db
      .select({
        rules: schema.challenges.rules,
        startsAt: schema.challenges.startsAt,
        endsAt: schema.challenges.endsAt,
        gameKey: schema.games.key,
        gameName: schema.games.name,
        formatKey: schema.gameFormats.key,
        formatName: schema.gameFormats.name,
        resultSchema: schema.gameFormats.resultSchema,
        requiredProof: schema.gameFormats.requiredProof,
      })
      .from(schema.challenges)
      .innerJoin(schema.games, eq(schema.games.id, schema.challenges.gameId))
      .innerJoin(schema.gameFormats, eq(schema.gameFormats.id, schema.challenges.formatId))
      .where(eq(schema.challenges.id, match.challengeId))
      .limit(1);
    if (!challenge) throw new NotFoundException('Match not found');

    const rows = await db
      .select({
        userId: schema.matchSides.userId,
        side: schema.matchSides.side,
        isPoster: schema.matchSides.isPoster,
        sideId: schema.matchSides.id,
        submittedAt: schema.matchSides.submittedAt,
        displayName: schema.users.displayName,
        rating: schema.gameProfiles.rating,
        provisional: schema.gameProfiles.provisional,
        wins: schema.gameProfiles.wins,
        losses: schema.gameProfiles.losses,
        draws: schema.gameProfiles.draws,
        inGameId: schema.gameProfiles.inGameId,
      })
      .from(schema.matchSides)
      .innerJoin(schema.users, eq(schema.users.id, schema.matchSides.userId))
      .innerJoin(schema.gameProfiles, eq(schema.gameProfiles.id, schema.matchSides.gameProfileId))
      .where(eq(schema.matchSides.matchId, matchId));

    const submissions = await db
      .select()
      .from(schema.resultSubmissions)
      .where(
        and(
          eq(schema.resultSubmissions.matchId, matchId),
          eq(schema.resultSubmissions.revision, 1),
        ),
      )
      .orderBy(asc(schema.resultSubmissions.submittedAt));

    const players: MatchPlayerDto[] = rows
      .sort((a, b) => a.side - b.side)
      .map((r) => {
        const tier = rankTierForRating(r.rating);
        return {
          userId: r.userId,
          username: r.displayName ?? r.inGameId,
          rating: r.rating,
          rankTier: tier,
          rankLabel: rankTierLabel(tier),
          provisional: r.provisional,
          record: `${r.wins}–${r.losses}–${r.draws}`,
          reputation: 'new' as const,
          gameId: r.inGameId,
          inGameId: r.inGameId,
          wins: r.wins,
          losses: r.losses,
          draws: r.draws,
          side: r.side,
          isPoster: r.isPoster,
          submittedAt: r.submittedAt?.toISOString() ?? null,
          submission: toSubmissionView(submissions.find((x) => x.matchSideId === r.sideId)),
        };
      });

    const status = match.status as MatchStatus;
    const roomCodeMode = roomCodeModeFor(challenge.gameKey);
    const timestamps: MatchTimestamps = { ...match, status };
    const resultDeadline =
      match.resultDeadline ?? new Date(challenge.startsAt.getTime() + RESULT_WINDOW_MS);
    const deadline = deadlineFromRow({
      status,
      startsAt: challenge.startsAt,
      resultSubmittedAt: match.resultSubmittedAt,
      resultDeadline,
      confirmationDeadline: match.confirmationDeadline,
    });
    const me = players.find((p) => p.userId === viewer.sub) ?? null;
    const opponent = me ? (players.find((p) => p.userId !== me.userId) ?? null) : null;
    const finished = status === 'confirmed' || status === 'forfeited' || status === 'resolved';
    const outcomeForViewer =
      !finished || !me
        ? null
        : match.winnerSide === null
          ? 'draw'
          : match.winnerSide === me.side
            ? 'win'
            : 'loss';
    const locksAt = chatLocksAt(timestamps);

    return {
      id: match.id,
      challengeId: match.challengeId,
      status,
      version: match.version,
      game: { key: challenge.gameKey, name: challenge.gameName },
      format: {
        key: challenge.formatKey,
        name: challenge.formatName,
        resultSchema: resultSchemaColumn.parse(challenge.resultSchema),
        requiredProof: requiredProofColumn.parse(challenge.requiredProof),
      },
      rules: challenge.rules,
      timeWindow: {
        startsAt: challenge.startsAt.toISOString(),
        endsAt: challenge.endsAt.toISOString(),
      },
      acceptedAt: match.acceptedAt.toISOString(),
      resultSubmittedAt: match.resultSubmittedAt?.toISOString() ?? null,
      completedAt: completedAt(timestamps)?.toISOString() ?? null,
      deadline: deadline ? { kind: deadline.kind, at: deadline.at.toISOString() } : null,
      me,
      players,
      opponent,
      agreedStartAt: challenge.startsAt.toISOString(),
      resultDeadline: resultDeadline.toISOString(),
      noShowAvailableAt: new Date(challenge.startsAt.getTime() + NO_SHOW_GATE_MS).toISOString(),
      confirmationDeadline: match.confirmationDeadline?.toISOString() ?? null,
      winnerSide: match.winnerSide,
      decidedVia: match.decidedVia,
      outcomeForViewer,
      nextAction: nextActionFor({
        status,
        isParticipant,
        iSubmitted: Boolean(me?.submission),
        opponentSubmitted: Boolean(opponent?.submission),
        startsAt: challenge.startsAt,
        resultDeadline,
        now,
      }),
      ratingDelta: null,
      confirmedAt: (match.confirmedAt ?? match.forfeitedAt)?.toISOString() ?? null,
      roomCode: canSeeRoomCode(isParticipant, status) ? match.roomCode : null,
      roomCodeMode,
      canSetRoomCode: roomCodeMode !== 'none' && canSeeRoomCode(isParticipant, status),
      chat: { locked: isChatLocked(timestamps, now), locksAt: locksAt?.toISOString() ?? null },
      viewerRole: isParticipant ? 'participant' : 'staff',
    };
  }

  /**
   * Set or change the room code (F6.5 / F7.2). Participants only, while the match is live,
   * and only for games whose config uses a room code. Bumps the match version and writes
   * an outbox event, so the opponent's room refreshes live.
   */
  async setRoomCode(
    matchId: string,
    viewer: AuthedUser,
    rawCode: string,
  ): Promise<{ roomCode: string }> {
    const roomCode = rawCode.trim();
    if (!/^[A-Za-z0-9-]{3,32}$/.test(roomCode)) {
      throw new BadRequestException('Room codes are 3 to 32 letters, numbers or dashes');
    }
    const { match } = await this.requireParticipant(matchId, viewer);
    const [challenge] = await db
      .select({ gameKey: schema.games.key })
      .from(schema.challenges)
      .innerJoin(schema.games, eq(schema.games.id, schema.challenges.gameId))
      .where(eq(schema.challenges.id, match.challengeId))
      .limit(1);
    if (roomCodeModeFor(challenge?.gameKey ?? '') === 'none') {
      throw new BadRequestException('This game does not use room codes');
    }
    if (!canSeeRoomCode(true, match.status as MatchStatus)) {
      throw new ConflictException('The match is not live');
    }

    await db.transaction(async (tx) => {
      const updated = await tx
        .update(schema.matches)
        .set({ roomCode, version: sql`${schema.matches.version} + 1`, updatedAt: new Date() })
        .where(and(eq(schema.matches.id, matchId), eq(schema.matches.status, match.status)))
        .returning({ id: schema.matches.id });
      if (updated.length === 0) throw new ConflictException('The match changed; try again');
      await tx.insert(schema.outboxEvents).values({
        id: uuidv7(),
        type: 'match.room_code_set',
        subjectId: matchId,
        payload: { matchId, setBy: viewer.sub },
      });
    });
    return { roomCode };
  }
}

function toSubmissionView(
  sub: typeof schema.resultSubmissions.$inferSelect | undefined,
): SubmissionView | null {
  if (!sub) return null;
  const score = sub.score as Partial<{ self: number; opponent: number }> | null;
  return {
    kind: sub.kind as SubmissionView['kind'],
    outcome: sub.result as SubmissionView['outcome'],
    score:
      typeof score?.self === 'number' && typeof score?.opponent === 'number'
        ? { self: score.self, opponent: score.opponent }
        : null,
    note: sub.note,
    submittedAt: sub.submittedAt.toISOString(),
    uploadId: sub.uploadId,
  };
}
