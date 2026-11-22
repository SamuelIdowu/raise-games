import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { db, pool, schema } from '../db/client';

export type OutboxEvent = typeof schema.outboxEvents.$inferSelect;

interface Handler {
  /** Stable consumer name; it keys this handler's delivery state in outbox_deliveries. */
  name: string;
  matches: (type: string) => boolean;
  handle: (event: OutboxEvent) => Promise<void>;
}

/**
 * Drains `outbox_events` (written in the same transaction as each domain change) and
 * hands each event to registered in-process consumers: live match-state broadcast,
 * match-chat creation, and later ratings (Sprint 10) and notifications (Sprint 11).
 *
 * Each consumer has its own delivery state (`outbox_deliveries`), so one consumer
 * finishing an event never hides it from another, and a consumer added later still
 * sees events inside the lookback window. Per consumer, a session advisory lock lets
 * exactly one API instance drain it at a time; delivery rows are written per event, so
 * delivery is at-least-once and handlers must be idempotent.
 *
 * A failing handler is retried with linear backoff and marked `dead` after
 * MAX_ATTEMPTS, rather than being treated as delivered.
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
  static readonly MAX_ATTEMPTS = 5;
  static readonly RETRY_BACKOFF_SEC = 30;
  /** Bounds the scan; events older than this are never (re)delivered. */
  static readonly LOOKBACK = sql`interval '7 days'`;

  register(handler: Handler): void {
    this.handlers.push(handler);
  }

  /** Registered consumer names (ops lag alerts, Sprint 15). */
  consumerNames(): string[] {
    return this.handlers.map((h) => h.name);
  }

  onApplicationBootstrap(): void {
    if (process.env.OUTBOX_RELAY_DISABLED === 'true') return;
    this.schedule();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    // Let an in-flight drain finish and release its consumer lock cleanly.
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

  /**
   * One batch per consumer. Public for tests. Returns the number of events this call
   * settled (delivered, skipped as not handled, or recorded as failed).
   */
  async drain(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      let total = 0;
      for (const handler of this.handlers) total += await this.drainConsumer(handler);
      return total;
    } finally {
      this.running = false;
    }
  }

  /**
   * Drains one consumer. The per-consumer advisory lock is a session lock on one dedicated
   * connection, and every read and delivery row is its own short statement: no transaction
   * stays open while handlers run on other connections. A long relay transaction held
   * key-share locks on outbox rows for the whole drain, so any transaction that both waited
   * on those rows and held rows a handler needed formed a lock cycle Postgres cannot detect
   * (one edge is in the application); the integration suites hit it whenever cleanup
   * deleted outbox events while relays in other processes were mid-drain.
   *
   * Delivery stays at-least-once: a crash between a handler and its delivery row means the
   * event is delivered again, exactly as a rolled-back transaction did before.
   */
  private async drainConsumer(handler: Handler): Promise<number> {
    const key = `outbox:${handler.name}`;
    const lockClient = await pool.connect();
    let locked = false;
    try {
      const { rows: lock } = await lockClient.query<{ ok: boolean }>(
        'select pg_try_advisory_lock(hashtextextended($1, 0)) as ok',
        [key],
      );
      if (!lock[0]?.ok) return 0; // another instance is draining this consumer
      locked = true;

      const d = schema.outboxDeliveries;
      const e = schema.outboxEvents;
      const rows = await db
        .select({ event: e, attempts: d.attempts })
        .from(e)
        .leftJoin(d, and(eq(d.eventId, e.id), eq(d.consumer, handler.name)))
        .where(
          and(
            gt(e.createdAt, sql`now() - ${OutboxRelay.LOOKBACK}`),
            or(
              isNull(d.eventId),
              and(
                eq(d.status, 'retry'),
                sql`${d.updatedAt} <= now() - make_interval(secs => ${OutboxRelay.RETRY_BACKOFF_SEC} * ${d.attempts})`,
              ),
            ),
          ),
        )
        .orderBy(asc(e.createdAt), asc(e.id))
        .limit(OutboxRelay.BATCH);

      for (const { event, attempts } of rows) {
        if (!handler.matches(event.type)) {
          await this.record(handler.name, event.id, 'skipped', attempts ?? 0, null);
          continue;
        }
        try {
          await handler.handle(event);
          await this.record(handler.name, event.id, 'done', (attempts ?? 0) + 1, null);
        } catch (error) {
          const tries = (attempts ?? 0) + 1;
          const status = tries >= OutboxRelay.MAX_ATTEMPTS ? 'dead' : 'retry';
          const message = (error as Error).message ?? String(error);
          this.logger.warn(
            `outbox consumer ${handler.name} failed on ${event.type} ${event.id} (attempt ${tries}, ${status}): ${message}`,
          );
          await this.record(handler.name, event.id, status, tries, message.slice(0, 500));
        }
      }
      return rows.length;
    } finally {
      if (locked) {
        try {
          await lockClient.query('select pg_advisory_unlock(hashtextextended($1, 0))', [key]);
          lockClient.release();
        } catch {
          // Could not unlock: destroy the connection, which releases the session lock.
          lockClient.release(true);
        }
      } else {
        lockClient.release();
      }
    }
  }

  private async record(
    consumer: string,
    eventId: string,
    status: 'done' | 'skipped' | 'retry' | 'dead',
    attempts: number,
    lastError: string | null,
  ) {
    try {
      await db
        .insert(schema.outboxDeliveries)
        .values({ consumer, eventId, status, attempts, lastError, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [schema.outboxDeliveries.consumer, schema.outboxDeliveries.eventId],
          set: { status, attempts, lastError, updatedAt: new Date() },
        });
    } catch (error) {
      if (pgCode(error) !== '23503') throw error; // foreign key: the event was purged mid-drain
    }
  }
}

function pgCode(error: unknown): string | undefined {
  for (
    let e = error as { code?: unknown; cause?: unknown } | undefined;
    e;
    e = e.cause as typeof e
  ) {
    if (typeof e.code === 'string') return e.code;
  }
  return undefined;
}
