import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './schema';

/**
 * Sprint 16 (F16.1): closed-beta invite codes. One code per cohort (a campus or
 * community); `uses` only ever moves through the conditional increment in
 * beta/invites.ts, so it can never pass `max_uses`, even under concurrent signups.
 */
export const inviteCodes = pgTable(
  'invite_codes',
  {
    id: uuid('id').primaryKey(),
    /** 8 characters, unambiguous alphabet, stored upper-case. */
    code: text('code').notNull(),
    cohort: text('cohort').notNull(),
    /** Campus or city label shown to staff. */
    place: text('place'),
    maxUses: integer('max_uses').notNull().default(50),
    uses: integer('uses').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invite_codes_code_uq').on(t.code),
    index('invite_codes_cohort_idx').on(t.cohort),
  ],
);

/** Which code (and so which cohort) each beta account joined through. */
export const inviteRedemptions = pgTable(
  'invite_redemptions',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeId: uuid('code_id')
      .notNull()
      .references(() => inviteCodes.id),
    cohort: text('cohort').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('invite_redemptions_cohort_idx').on(t.cohort)],
);

/**
 * People without a code who asked to join. Phone numbers are personal data: rows are
 * deleted 90 days after they were created (beta/invites.ts purges on every write and list).
 */
export const betaWaitlist = pgTable(
  'beta_waitlist',
  {
    id: uuid('id').primaryKey(),
    phone: text('phone').notNull(),
    place: text('place'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    inviteCodeId: uuid('invite_code_id').references(() => inviteCodes.id),
  },
  (t) => [uniqueIndex('beta_waitlist_phone_uq').on(t.phone)],
);

/**
 * Sprint 16 (F16.3): in-app feedback with severity triage. S1 = wrong results, ratings or
 * sanctions; data loss or exposure; a whole flow broken for many players; security.
 */
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** bug | idea | other */
    kind: text('kind').notNull(),
    body: text('body').notNull(),
    page: text('page'),
    appVersion: text('app_version'),
    userAgent: text('user_agent'),
    /** S1–S4, set by staff at triage; null until triaged. */
    severity: text('severity'),
    /** new | triaged | fixed | wont_fix | duplicate */
    status: text('status').notNull().default('new'),
    note: text('note'),
    triagedById: uuid('triaged_by_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('feedback_status_idx').on(t.status, t.createdAt),
    index('feedback_open_severity_idx')
      .on(t.severity)
      .where(sql`${t.status} in ('new', 'triaged')`),
  ],
);
