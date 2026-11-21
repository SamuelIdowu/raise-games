import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { FILE_STORAGE, type FileStoragePort } from '../storage/file-storage.port';

/** Rows handled per pass, so one run never holds long locks. */
export const RETENTION_BATCH = 500;

export interface RetentionPolicy {
  /** Days to keep result and dispute screenshots; null = keep forever. */
  screenshotDays: number | null;
  /** Days to keep match chat messages after the chat locks; null = keep forever. */
  chatDays: number | null;
}

/**
 * A match's evidence is still needed while it is being played or decided: a live status,
 * or a dispute that is not final (a ruled dispute can still be appealed).
 */
const EVIDENCE_NEEDED = (matchColumn: string) =>
  sql.raw(`(
  EXISTS (SELECT 1 FROM matches m WHERE m.id = ${matchColumn}
          AND m.status IN ('accepted','in_progress','awaiting_result','awaiting_confirmation','disputed'))
  OR EXISTS (SELECT 1 FROM disputes d WHERE d.match_id = ${matchColumn} AND d.status <> 'final')
)`);

/**
 * Retention purge (audit B28). Inert until the owner sets the periods
 * (SCREENSHOT_RETENTION_DAYS, CHAT_RETENTION_DAYS); the numbers are a legal and owner
 * decision, not a code default.
 *
 * - Screenshots past the period: the stored file and thumbnail are deleted from storage;
 *   the upload row stays with its hashes, so reused-screenshot detection keeps working.
 * - Match chat messages past the period after the chat locked are deleted; messages that
 *   were reported or flagged are kept as moderation evidence.
 * - Nothing tied to a match still in play or in a non-final dispute is touched.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(@Inject(FILE_STORAGE) private readonly storage: FileStoragePort) {}

  async purge(policy: RetentionPolicy, now = new Date()) {
    const screenshots = policy.screenshotDays
      ? await this.purgeScreenshots(policy.screenshotDays, now)
      : 0;
    const messages = policy.chatDays ? await this.purgeChat(policy.chatDays, now) : 0;
    if (screenshots || messages) {
      this.logger.log({ event: 'retention.purged', screenshots, messages }, 'retention purge');
    }
    return { screenshots, messages };
  }

  private async purgeScreenshots(days: number, now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    let total = 0;
    for (;;) {
      const { rows } = await db.execute<{
        id: string;
        storage_key: string;
        thumb_key: string | null;
      }>(sql`
        SELECT u.id, u.storage_key, u.thumb_key
        FROM uploads u
        WHERE u.status = 'ready' AND u.storage_key IS NOT NULL AND u.created_at < ${cutoff}
          AND (u.match_id IS NULL OR NOT ${EVIDENCE_NEEDED('u.match_id')})
        ORDER BY u.created_at
        LIMIT ${RETENTION_BATCH}`);
      if (!rows.length) return total;
      for (const r of rows) {
        // Storage first: if the row update fails, the next run retries the (gone) file harmlessly.
        await this.storage.deleteObject(r.storage_key).catch(() => undefined);
        if (r.thumb_key) await this.storage.deleteObject(r.thumb_key).catch(() => undefined);
      }
      await db.execute(sql`
        UPDATE uploads SET status = 'purged', storage_key = NULL, thumb_key = NULL
        WHERE id IN (${sql.join(
          rows.map((r) => sql`${r.id}`),
          sql`, `,
        )})`);
      total += rows.length;
      if (rows.length < RETENTION_BATCH) return total;
    }
  }

  private async purgeChat(days: number, now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    let total = 0;
    for (;;) {
      const { rows } = await db.execute<{ id: string }>(sql`
        WITH doomed AS (
          SELECT msg.id, msg.created_at
          FROM messages msg
          JOIN conversations c ON c.id = msg.conversation_id
          WHERE c.scope = 'match' AND c.locked_at IS NOT NULL AND c.locked_at < ${cutoff}
            AND NOT ${EVIDENCE_NEEDED('c.match_id')}
            AND NOT EXISTS (SELECT 1 FROM message_reports r WHERE r.message_id = msg.id)
            AND NOT EXISTS (SELECT 1 FROM chat_flags f WHERE f.message_id = msg.id)
          LIMIT ${RETENTION_BATCH}
        )
        DELETE FROM messages m USING doomed
        WHERE m.id = doomed.id AND m.created_at = doomed.created_at
        RETURNING m.id`);
      total += rows.length;
      if (rows.length < RETENTION_BATCH) return total;
    }
  }
}
