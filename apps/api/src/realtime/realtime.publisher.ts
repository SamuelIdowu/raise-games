import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Emits to socket rooms from anywhere in the app. With the Redis adapter installed,
 * `server.to(room).emit` fans out to sockets on every API instance.
 *
 * The gateway attaches the server on init. Until then (or when the API runs without a
 * WebSocket server, e.g. some tests) emits are dropped: clients recover through the
 * HTTP polling fallback, so a missed live event is never data loss.
 */
@Injectable()
export class RealtimePublisher {
  private readonly logger = new Logger(RealtimePublisher.name);
  private server: Server | null = null;
  private readonly onAttach: Array<() => void> = [];

  attach(server: Server): void {
    this.server = server;
    for (const fn of this.onAttach.splice(0)) fn();
  }

  /**
   * Runs `fn` once a socket server is attached (now, if it already is). Consumers whose only
   * job is a live emit register through this, so a process without a gateway never claims
   * their outbox events and drops the broadcast for everyone.
   */
  whenAttached(fn: () => void): void {
    if (this.server) fn();
    else this.onAttach.push(fn);
  }

  get attached(): boolean {
    return this.server !== null;
  }

  emit(rooms: string | string[], event: string, payload: unknown): void {
    if (!this.server) return;
    try {
      this.server.to(rooms).emit(event, payload);
    } catch (error) {
      this.logger.warn(`emit ${event} failed: ${(error as Error).message}`);
    }
  }
}
