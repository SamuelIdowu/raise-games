import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { asc, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../db/client';

export type OutboxEvent = typeof schema.outboxEvents.$inferSelect;

interface Handler {
  name: string;
  matches: (type: string) => boolean;
  handle: (event: OutboxEvent) => Promise<void>;
}

/**
 * Drains `outbox_events` (written in the same transaction as each domain change) and
 * hands each event to registered in-process handlers: live match-state broadcast,
 * match-chat creation, and in Sprint 11 the notification service.
 *
 * Claiming uses FOR UPDATE SKIP LOCKED inside a transaction, so every API instance can
 * run the relay and each event is processed once. Delivery is at-least-once per batch
 * (a crash before commit re-runs the batch); handlers must be idempotent.
 *
 * A handler error is logged and the event is still marked processed: today's handlers
 * are best-effort and self-healing (clients re-fetch on reconnect; chat is created
 * lazily). Sprint 11's notification handler will need its own retry/dead-letter state
 * rather than relying on processed_at — noted in the sprint doc.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private readonly handlers: Handler[] = [];
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  static readonly INTERVAL_MS = 500;
  static readonly BATCH = 100;

  register(handler: Handler): void {
    this.handlers.push(handler);
  }

  onApplicationBootstrap(): void {
    if (process.env.OUTBOX_RELAY_DISABLED === 'true') return;
    this.schedule();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    // Let an in-flight drain finish so its transaction commits or rolls back cleanly.
    for (let i = 0; this.running && i < 50; i++) await new Promise((r) => setTimeout(r, 20));
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      try {
        const n = await this.drain();
        if (n === OutboxRelay.BATCH) return this.scheduleNow();
      } catch (error) {
        this.logger.warn(`outbox drain failed: ${(error as Error).message}`);
      }
      this.schedule();
    }, OutboxRelay.INTERVAL_MS);
    this.timer.unref?.();
  }

  private scheduleNow(): void {
    if (this.stopped) return;
    setImmediate(() => {
      this.drain()
        .catch((error: Error) => this.logger.warn(`outbox drain failed: ${error.message}`))
        .finally(() => this.schedule());
    });
  }

  /** Processes one batch. Public for tests. Returns the number of events claimed. */
  async drain(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await db.transaction(async (tx) => {
        const events = await tx
          .select()
          .from(schema.outboxEvents)
          .where(isNull(schema.outboxEvents.processedAt))
          .orderBy(asc(schema.outboxEvents.createdAt), asc(schema.outboxEvents.id))
          .limit(OutboxRelay.BATCH)
          .for('update', { skipLocked: true });
        if (events.length === 0) return 0;

        for (const event of events) {
          for (const handler of this.handlers) {
            if (!handler.matches(event.type)) continue;
            try {
              await handler.handle(event);
            } catch (error) {
              this.logger.warn(
                `outbox handler ${handler.name} failed on ${event.type} ${event.id}: ${(error as Error).message}`,
              );
            }
          }
        }

        await tx
          .update(schema.outboxEvents)
          .set({ processedAt: new Date() })
          .where(
            inArray(
              schema.outboxEvents.id,
              events.map((e) => e.id),
            ),
          );
        return events.length;
      });
    } finally {
      this.running = false;
    }
  }
}
