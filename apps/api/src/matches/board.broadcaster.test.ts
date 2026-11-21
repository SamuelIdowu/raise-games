import { describe, expect, it } from 'vitest';
import { BoardBroadcaster, isBoardEvent } from './board.broadcaster';
import type { OutboxEvent } from '../realtime/outbox-relay';
import type { OutboxRelay } from '../realtime/outbox-relay';
import type { RealtimePublisher } from '../realtime/realtime.publisher';

function setup() {
  const emits: Array<{ rooms: string | string[]; event: string; payload: unknown }> = [];
  const publisher = {
    emit: (rooms: string | string[], event: string, payload: unknown) =>
      emits.push({ rooms, event, payload }),
  } as unknown as RealtimePublisher;
  return { emits, b: new BoardBroadcaster({} as OutboxRelay, publisher) };
}

const ev = (type: string, payload: Record<string, unknown>): OutboxEvent => ({
  id: 'e1',
  type,
  subjectId: 'c1',
  payload,
  createdAt: new Date(),
  processedAt: null,
});

describe('BoardBroadcaster (audit B32)', () => {
  it('consumes only challenge lifecycle events', () => {
    expect(isBoardEvent('challenge.created')).toBe(true);
    expect(isBoardEvent('challenge.expired')).toBe(true);
    expect(isBoardEvent('match.confirmed')).toBe(false);
  });

  it('announces an open challenge to the whole board', () => {
    const { emits, b } = setup();
    b.handle(ev('challenge.created', { gameId: 'g1', isDirect: false, posterId: 'u1' }));
    expect(emits).toEqual([
      {
        rooms: 'board',
        event: 'board:changed',
        payload: { challengeId: 'c1', gameId: 'g1', change: 'created' },
      },
    ]);
  });

  it('tells only the two players about a new direct challenge', () => {
    const { emits, b } = setup();
    b.handle(
      ev('challenge.created', {
        gameId: 'g1',
        isDirect: true,
        posterId: 'u1',
        targetPlayerId: 'u2',
      }),
    );
    expect(emits[0]!.rooms).toEqual(['user:u1', 'user:u2']);
  });

  it('removals go to the board, with the game when known', () => {
    const { emits, b } = setup();
    b.handle(ev('challenge.expired', {}));
    expect(emits[0]).toMatchObject({
      rooms: 'board',
      payload: { challengeId: 'c1', gameId: null, change: 'removed' },
    });
  });
});
