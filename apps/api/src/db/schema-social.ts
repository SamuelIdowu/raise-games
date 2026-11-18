import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { messageReports, users } from './schema';

/**
 * Sprint 14 (F14.2): friend requests. One row per ask; a pair has at most one live row
 * (pending or accepted) at a time, enforced by the partial unique index on the pair key.
 *
 *   pending → accepted | declined | cancelled
 *   accepted → removed   (unfriend, or either side blocks)
 *
 * Declines are silent (the requester is not notified) and start a cooldown before the
 * same requester can ask again (dm.rules.ts). History rows are kept for abuse review.
 */
export const friendRequests = pgTable(
  'friend_requests',
  {
    id: uuid('id').primaryKey(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: uuid('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Sorted "a:b" user pair, shared with conversations.dm_pair_key. */
    pairKey: text('pair_key').notNull(),
    /** pending | accepted | declined | cancelled | removed */
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('friend_requests_live_pair_uq')
      .on(t.pairKey)
      .where(sql`${t.status} in ('pending', 'accepted')`),
    index('friend_requests_addressee_idx').on(t.addresseeId, t.status),
    index('friend_requests_requester_idx').on(t.requesterId, t.status),
  ],
);

/**
 * Sprint 14 (F14.4): the conversation around a reported message, frozen at report time
 * (up to 10 messages before it and 5 after), so moderators judge it in context even if
 * the conversation is later blocked, muted or purged by retention.
 */
export const messageReportContexts = pgTable('message_report_contexts', {
  reportId: uuid('report_id')
    .primaryKey()
    .references(() => messageReports.id, { onDelete: 'cascade' }),
  /** [{ id, senderId, kind, body, createdAt, reported }] oldest first. */
  messages: jsonb('messages').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
