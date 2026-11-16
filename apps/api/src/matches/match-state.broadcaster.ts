import { Injectable, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { OutboxRelay, type OutboxEvent } from '../realtime/outbox-relay';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import {
  ServerEvents,
  matchRoom,
  userRoom,
  type MatchStateEvent,
} from '../realtime/realtime.events';

/**
 * Events that change what a match room shows. `match.*` events carry the match id as
 * their subject; the others name it in the payload (Sprint 6 accept, Sprint 8 results).
 */
const PAYLOAD_MATCH_EVENTS = new Set([
  'challenge.accepted',
  'result.submitted',
  'noshow.reported',
  'dispute.opened',
  // Sprint 9: dispute changes that do not bump the match version still refresh the room.
  'dispute.status_changed',
  'dispute.appealed',
  'dispute.ruled',
]);

export function isMatchStateEvent(type: string): boolean {
  return type.startsWith('match.') || PAYLOAD_MATCH_EVENTS.has(type);
}

/** Which match an outbox event is about, if any. */
export function matchIdForEvent(
  event: Pick<OutboxEvent, 'type' | 'subjectId' | 'payload'>,
): string | null {
  if (event.type.startsWith('match.')) return event.subjectId;
  const payload = event.payload as { matchId?: unknown } | null;
  if (PAYLOAD_MATCH_EVENTS.has(event.type) && typeof payload?.matchId === 'string') {
    return payload.matchId;
  }
  return null;
}

/**
 * Broadcasts live match state from outbox events (F7.1 / F7.2). Re-reads the match so
 * the payload is always current state, not the event's snapshot: duplicate or
 * out-of-order deliveries are harmless, and clients keep the highest `version`.
 *
 * Sent to the match room and to both players' user rooms, so a player who is on the
 * board (not in the room) still learns their challenge was accepted. socket.io
 * deduplicates a socket that is in several of the target rooms.
 */
@Injectable()
export class MatchStateBroadcaster implements OnModuleInit {
  constructor(
    private readonly relay: OutboxRelay,
    private readonly publisher: RealtimePublisher,
  ) {}

  onModuleInit(): void {
    this.relay.register({
      name: 'match-state-broadcast',
      matches: isMatchStateEvent,
      handle: (event) => this.handle(event),
    });
  }

  async handle(event: OutboxEvent): Promise<void> {
    const matchId = matchIdForEvent(event);
    if (!matchId) return;

    const [match] = await db
      .select({
        id: schema.matches.id,
        status: schema.matches.status,
        version: schema.matches.version,
      })
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId))
      .limit(1);
    if (!match) return;

    const sides = await db
      .select({ userId: schema.matchSides.userId })
      .from(schema.matchSides)
      .where(eq(schema.matchSides.matchId, matchId));

    const payload: MatchStateEvent = {
      matchId,
      status: match.status,
      version: match.version,
      cause: event.type,
    };
    this.publisher.emit(
      [matchRoom(matchId), ...sides.map((s) => userRoom(s.userId))],
      ServerEvents.MatchState,
      payload,
    );
  }
}
