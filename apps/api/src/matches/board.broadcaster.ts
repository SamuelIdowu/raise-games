import { Injectable, OnModuleInit } from '@nestjs/common';
import { OutboxRelay, type OutboxEvent } from '../realtime/outbox-relay';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import {
  BOARD_ROOM,
  ServerEvents,
  userRoom,
  type BoardChangedEvent,
} from '../realtime/realtime.events';

const REMOVED = new Set([
  'challenge.accepted',
  'challenge.cancelled',
  'challenge.declined',
  'challenge.expired',
]);

export function isBoardEvent(type: string): boolean {
  return type === 'challenge.created' || REMOVED.has(type);
}

/**
 * Live challenge board (F5.4, audit B32): tells open Play tabs when a challenge appears or
 * leaves, so they refresh instead of waiting for the next poll. The payload is only ids;
 * the client re-reads the board through the normal API, which applies every visibility rule.
 *
 * Open challenges go to the `board` room every socket joins. A new direct challenge goes
 * only to its two players, so its existence is not announced to everyone.
 */
@Injectable()
export class BoardBroadcaster implements OnModuleInit {
  constructor(
    private readonly relay: OutboxRelay,
    private readonly publisher: RealtimePublisher,
  ) {}

  onModuleInit(): void {
    // Same rule as match state: only an instance that can emit consumes these events.
    this.publisher.whenAttached(() =>
      this.relay.register({
        name: 'board-broadcast',
        matches: isBoardEvent,
        handle: async (event) => this.handle(event),
      }),
    );
  }

  handle(event: OutboxEvent): void {
    const p = (event.payload ?? {}) as {
      gameId?: string;
      isDirect?: boolean;
      posterId?: string;
      targetPlayerId?: string | null;
      targetPlayerIds?: string[];
    };
    const payload: BoardChangedEvent = {
      challengeId: event.subjectId,
      gameId: p.gameId ?? null,
      change: event.type === 'challenge.created' ? 'created' : 'removed',
    };
    const rooms =
      event.type === 'challenge.created' && p.isDirect
        ? [p.posterId, p.targetPlayerId, ...(p.targetPlayerIds ?? [])]
            .filter((u): u is string => !!u)
            .map(userRoom)
        : BOARD_ROOM;
    this.publisher.emit(rooms, ServerEvents.BoardChanged, payload);
  }
}
