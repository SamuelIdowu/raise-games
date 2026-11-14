/**
 * RAISE day-one schema — Sprint 0 (F0.8)
 *
 * Conventions (Technical Architecture doc):
 * - UUIDv7 ids generated in app code (Postgres 17 has no native UUIDv7)
 * - timestamptz everywhere ({ withTimezone: true })
 * - money in minor units (integer) with a currency code
 * - soft deletes only where history matters
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['player', 'moderator', 'admin']);
export const identityTierEnum = pgEnum('identity_tier', [
  'tier0_unverified',
  'tier1_phone_verified',
  'tier2_kyc',
  'tier3_kyc_plus',
]);
export const kycStatusEnum = pgEnum('kyc_status', ['none', 'pending', 'verified', 'rejected']);
export const ageStatusEnum = pgEnum('age_status', ['pending', 'verified', 'rejected']);
export const sanctionTypeEnum = pgEnum('sanction_type', [
  'warning',
  'suspension',
  'temporary_ban',
  'permanent_ban',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    phone: text('phone').notNull(),
    displayName: text('display_name'),
    jurisdictionState: text('jurisdiction_state'),
    identityTier: identityTierEnum('identity_tier').notNull().default('tier1_phone_verified'),
    kycStatus: kycStatusEnum('kyc_status').notNull().default('none'),
    ageVerificationStatus: ageStatusEnum('age_verification_status').notNull().default('pending'),
    role: roleEnum('role').notNull().default('player'),
    tosVersionAccepted: text('tos_version_accepted'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_phone_uq').on(t.phone)],
);

export const sanctions = pgTable(
  'sanctions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    type: sanctionTypeEnum('type').notNull().default('suspension'),
    reason: text('reason').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sanctions_user_idx').on(t.userId),
    index('sanctions_active_idx').on(t.userId, t.startsAt, t.endsAt, t.revokedAt),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** Refresh-token family: every rotation stays in the same chain so reuse can revoke it. */
    familyId: uuid('family_id'),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    deviceId: text('device_id'),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_token_idx').on(t.refreshTokenHash),
    index('sessions_family_idx').on(t.familyId),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey(),
    actorId: uuid('actor_id').references(() => users.id),
    action: text('action').notNull(),
    objectType: text('object_type'),
    objectId: text('object_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_action_idx').on(t.action), index('audit_log_actor_idx').on(t.actorId)],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey(),
    type: text('type').notNull(),
    subjectId: text('subject_id').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [index('outbox_unprocessed_idx').on(t.processedAt)],
);

export const featureFlags = pgTable(
  'feature_flags',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull(),
    stage: text('stage').notNull(), // e.g. '1', '2'
    jurisdiction: text('jurisdiction'), // null = all
    enabled: boolean('enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('feature_flags_key_stage_jurisdiction_uq').on(t.key, t.stage, t.jurisdiction),
  ],
);

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey(),
    accountRef: text('account_ref').notNull(),
    accountType: text('account_type').notNull(), // 'user', 'platform_fee', 'escrow', 'provider'
    currency: text('currency').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ledger_accounts_ref_currency_uq').on(t.accountRef, t.currency)],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id),
    amountMinor: integer('amount_minor').notNull(), // signed; sums to zero across an idempotent transfer group
    entryType: text('entry_type').notNull(), // 'hold', 'release', 'refund', 'fee', 'transfer'
    idempotencyKey: text('idempotency_key').notNull(),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ledger_entries_idempotency_uq').on(t.idempotencyKey),
    index('ledger_entries_account_idx').on(t.accountId),
  ],
);

export const feeRules = pgTable(
  'fee_rules',
  {
    id: uuid('id').primaryKey(),
    version: integer('version').notNull(),
    currency: text('currency').notNull(),
    params: jsonb('params').notNull(),
    active: boolean('active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('fee_rules_version_currency_uq').on(t.version, t.currency)],
);

export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    status: text('status').notNull().default('enabled'),
    idFields: jsonb('id_fields').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('games_key_uq').on(t.key)],
);

export const gameFormats = pgTable(
  'game_formats',
  {
    id: uuid('id').primaryKey(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    key: text('key').notNull(),
    name: text('name').notNull(),
    resultSchema: jsonb('result_schema').notNull(),
    requiredProof: jsonb('required_proof').notNull(),
    tiebreakRules: text('tiebreak_rules'),
  },
  (t) => [uniqueIndex('game_formats_game_key_uq').on(t.gameId, t.key)],
);

export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    termsType: text('terms_type').notNull(), // 'terms' | 'privacy'
    termsVersion: text('terms_version').notNull(),
    ip: text('ip'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('consent_records_user_terms_version_uq').on(t.userId, t.termsType, t.termsVersion),
  ],
);

export const challengeStatusEnum = pgEnum('challenge_status', [
  'open',
  'accepted',
  'in_progress',
  'awaiting_result',
  'awaiting_confirmation',
  'confirmed',
  'disputed',
  'resolved',
  'cancelled',
  'expired',
  'forfeited',
  'voided',
]);

export const challenges = pgTable(
  'challenges',
  {
    id: uuid('id').primaryKey(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    formatId: uuid('format_id')
      .notNull()
      .references(() => gameFormats.id),
    posterId: uuid('poster_id')
      .notNull()
      .references(() => users.id),
    targetPlayerId: uuid('target_player_id').references(() => users.id),
    status: challengeStatusEnum('status').notNull().default('open'),
    rules: text('rules').notNull().default(''),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    acceptanceDeadline: timestamp('acceptance_deadline', { withTimezone: true }).notNull(),
    stakeAmountMinor: integer('stake_amount_minor').notNull().default(0),
    currency: text('currency').notNull().default('NGN'),
    feeScheduleVersion: integer('fee_schedule_version').notNull().default(1),
    ratingGap: integer('rating_gap'),
    repeatPairCount: integer('repeat_pair_count').notNull().default(0),
    version: integer('version').notNull().default(1),
    idempotencyKey: uuid('idempotency_key').unique(),
    acceptedById: uuid('accepted_by_id').references(() => users.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('challenges_board_idx').on(t.status, t.createdAt, t.id),
    index('challenges_game_board_idx').on(t.gameId, t.status, t.createdAt, t.id),
    index('challenges_poster_idx').on(t.posterId, t.createdAt),
    index('challenges_target_idx').on(t.targetPlayerId, t.status),
    index('challenges_deadline_idx').on(t.status, t.acceptanceDeadline),
  ],
);

export const pairingCounters = pgTable(
  'pairing_counters',
  {
    id: uuid('id').primaryKey(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    userAId: uuid('user_a_id')
      .notNull()
      .references(() => users.id),
    userBId: uuid('user_b_id')
      .notNull()
      .references(() => users.id),
    count: integer('count').notNull().default(0),
    lastPairingAt: timestamp('last_pairing_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('pairing_counters_game_pair_uq').on(t.gameId, t.userAId, t.userBId),
    index('pairing_counters_a_idx').on(t.userAId),
    index('pairing_counters_b_idx').on(t.userBId),
  ],
);

export const matchStateEnum = pgEnum('match_state', [
  'open',
  'accepted',
  'in_progress',
  'awaiting_result',
  'awaiting_confirmation',
  'confirmed',
  'disputed',
  'resolved',
  'cancelled',
  'expired',
  'forfeited',
  'voided',
]);

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey(),
    challengeId: uuid('challenge_id')
      .notNull()
      .references(() => challenges.id),
    status: matchStateEnum('status').notNull().default('accepted'),
    version: integer('version').notNull().default(1),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    inProgressAt: timestamp('in_progress_at', { withTimezone: true }),
    resultSubmittedAt: timestamp('result_submitted_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    disputedAt: timestamp('disputed_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    expiredAt: timestamp('expired_at', { withTimezone: true }),
    forfeitedAt: timestamp('forfeited_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    roomCode: text('room_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('matches_challenge_id_uq').on(t.challengeId),
    index('matches_status_idx').on(t.status),
    index('matches_deadline_idx').on(t.status, t.updatedAt),
  ],
);

export const matchSides = pgTable(
  'match_sides',
  {
    id: uuid('id').primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    gameProfileId: uuid('game_profile_id')
      .notNull()
      .references(() => gameProfiles.id),
    side: integer('side').notNull(),
    isPoster: boolean('is_poster').notNull().default(false),
    isAcceptor: boolean('is_acceptor').notNull().default(false),
    result: text('result'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    disputedAt: timestamp('disputed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('match_sides_match_side_uq').on(t.matchId, t.side),
    uniqueIndex('match_sides_match_user_uq').on(t.matchId, t.userId),
    index('match_sides_user_idx').on(t.userId),
  ],
);

export const matchParticipants = pgTable(
  'match_participants',
  {
    id: uuid('id').primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    gameProfileId: uuid('game_profile_id')
      .notNull()
      .references(() => gameProfiles.id),
    isReady: boolean('is_ready').notNull().default(false),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('match_participants_match_user_uq').on(t.matchId, t.userId),
    index('match_participants_user_idx').on(t.userId),
  ],
);

export const resultSubmissions = pgTable(
  'result_submissions',
  {
    id: uuid('id').primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    submitterId: uuid('submitter_id')
      .notNull()
      .references(() => users.id),
    matchSideId: uuid('match_side_id')
      .notNull()
      .references(() => matchSides.id),
    result: text('result').notNull(),
    score: jsonb('score').notNull(),
    proof: jsonb('proof'),
    note: text('note'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('result_submissions_match_idx').on(t.matchId),
    index('result_submissions_submitter_idx').on(t.submitterId),
  ],
);

export const disputes = pgTable(
  'disputes',
  {
    id: uuid('id').primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    raisedById: uuid('raised_by_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence'),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('disputes_match_idx').on(t.matchId),
    index('disputes_raised_by_idx').on(t.raisedById),
  ],
);

export const rulings = pgTable(
  'rulings',
  {
    id: uuid('id').primaryKey(),
    disputeId: uuid('dispute_id')
      .notNull()
      .references(() => disputes.id, { onDelete: 'cascade' }),
    moderatorId: uuid('moderator_id')
      .notNull()
      .references(() => users.id),
    ruling: text('ruling').notNull(),
    justification: text('justification').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('rulings_dispute_id_uq').on(t.disputeId),
    index('rulings_moderator_idx').on(t.moderatorId),
  ],
);

export const gameProfiles = pgTable(
  'game_profiles',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    inGameId: text('in_game_id').notNull(),
    city: text('city'),
    campus: text('campus'),
    rating: integer('rating').notNull().default(1000),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    streak: integer('streak').notNull().default(0),
    provisional: boolean('provisional').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('game_profiles_user_game_uq').on(t.userId, t.gameId),
    index('game_profiles_user_idx').on(t.userId),
    index('game_profiles_game_idx').on(t.gameId),
  ],
);
