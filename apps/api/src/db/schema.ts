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
  primaryKey,
  bigserial,
  bigint,
  doublePrecision,
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
    /** Optional; notification email channel (Sprint 11). Never shown to other players. */
    email: text('email'),
    jurisdictionState: text('jurisdiction_state'),
    identityTier: identityTierEnum('identity_tier').notNull().default('tier1_phone_verified'),
    kycStatus: kycStatusEnum('kyc_status').notNull().default('none'),
    ageVerificationStatus: ageStatusEnum('age_verification_status').notNull().default('pending'),
    role: roleEnum('role').notNull().default('player'),
    tosVersionAccepted: text('tos_version_accepted'),
    /** Sprint 12: staff TOTP secret, AES-256-GCM encrypted (shared/secret-box). */
    mfaSecretEnc: text('mfa_secret_enc'),
    /** Set once the first TOTP code verifies; staff routes require it. */
    mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true }),
    /** Fraud signals before this time no longer count toward auto-limits (moderator clear). */
    fraudClearedAt: timestamp('fraud_cleared_at', { withTimezone: true }),
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
    /** Sprint 12 ladder step (1 warning, 2 = 7 days, 3 = 30 days, 4 = permanent ban). */
    step: integer('step'),
    /** dispute | report | manual | bulk | auto */
    source: text('source').notNull().default('manual'),
    sourceId: uuid('source_id'),
    issuedById: uuid('issued_by_id').references(() => users.id),
    revokedById: uuid('revoked_by_id').references(() => users.id),
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
    /** Sprint 12: last TOTP check on this session's refresh family (staff step-up). */
    mfaVerifiedAt: timestamp('mfa_verified_at', { withTimezone: true }),
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
  (t) => [
    index('outbox_unprocessed_idx').on(t.processedAt),
    index('outbox_created_idx').on(t.createdAt, t.id),
  ],
);

/**
 * Per-consumer delivery state for outbox events. Each relay consumer (live broadcast,
 * chat creation, ratings, notifications…) tracks its own progress, so one consumer
 * finishing never hides an event from another. `processed_at` on outbox_events is no
 * longer written (kept for history).
 */
export const outboxDeliveries = pgTable(
  'outbox_deliveries',
  {
    consumer: text('consumer').notNull(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => outboxEvents.id, { onDelete: 'cascade' }),
    /** done | skipped (type not handled) | retry | dead (gave up after max attempts) */
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.consumer, t.eventId] }),
    index('outbox_deliveries_status_idx').on(t.consumer, t.status),
  ],
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

/**
 * Sprint 13 (F13.1): double-entry ledger. Entries are immutable; corrections are reversing
 * transactions. `balance_minor` is a cache updated under row lock with every posting; the
 * nightly check proves it equals the sum of entries and that every currency nets to zero.
 *
 * Account refs: `user:<id>:available`, `user:<id>:held`, `platform:fees`,
 * `provider:<name>:clearing`. Only clearing accounts may go negative (they mirror money
 * held outside the platform).
 */
export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey(),
    accountRef: text('account_ref').notNull(),
    /** 'user_available' | 'user_held' | 'platform_fee' | 'provider_clearing' */
    accountType: text('account_type').notNull(),
    /** Owning user for user_* accounts. */
    ownerId: uuid('owner_id').references(() => users.id),
    currency: text('currency').notNull(),
    balanceMinor: bigint('balance_minor', { mode: 'number' }).notNull().default(0),
    allowNegative: boolean('allow_negative').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ledger_accounts_ref_currency_uq').on(t.accountRef, t.currency),
    index('ledger_accounts_owner_idx').on(t.ownerId),
  ],
);

/** One balanced posting. The idempotency key makes every money movement replay-safe. */
export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: uuid('id').primaryKey(),
    idempotencyKey: text('idempotency_key').notNull(),
    /** 'hold' | 'release' | 'refund' | 'deposit' | 'withdrawal' | 'reversal' | 'adjustment' */
    kind: text('kind').notNull(),
    currency: text('currency').notNull(),
    /** What caused it, e.g. ('match', matchId) or ('provider_event', eventId). */
    referenceType: text('reference_type'),
    referenceId: text('reference_id'),
    /** A reversal points at the transaction it cancels; each can be reversed once. */
    reversesTransactionId: uuid('reverses_transaction_id'),
    /** SHA-256 of the canonical request, so a replay with different contents is refused. */
    requestHash: text('request_hash').notNull(),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ledger_transactions_idempotency_uq').on(t.idempotencyKey),
    uniqueIndex('ledger_transactions_reverses_uq').on(t.reversesTransactionId),
    index('ledger_transactions_reference_idx').on(t.referenceType, t.referenceId),
  ],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => ledgerTransactions.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id),
    /** Signed minor units, non-zero. A transaction's entries sum to zero (DB-enforced). */
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ledger_entries_account_idx').on(t.accountId),
    index('ledger_entries_transaction_idx').on(t.transactionId),
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
    /**
     * enabled | disabled. The seed disables formats that leave games.json, so they stop
     * being offered for new challenges while past challenges keep resolving them.
     */
    status: text('status').notNull().default('enabled'),
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
    /** Agreed start, copied from the challenge; the sweeper moves accepted → in_progress at it. */
    scheduledStartAt: timestamp('scheduled_start_at', { withTimezone: true }),
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
    /** Sprint 8: first result must land before this (agreed start + 24h, PRD). */
    resultDeadline: timestamp('result_deadline', { withTimezone: true }),
    /** Sprint 8: opponent confirmation window end (first submission + 24h, PRD). */
    confirmationDeadline: timestamp('confirmation_deadline', { withTimezone: true }),
    /** 0 or 1 (match_sides.side) once decided; null for draws and unresolved matches. */
    winnerSide: integer('winner_side'),
    /** How the match was decided: agreement | auto_timeout | no_show_conceded | no_show_timeout. */
    decidedVia: text('decided_via'),
    /** Sprint 13 (F13.5): Stage 3 bracket/competition slot; null for 1v1 challenges. */
    competitionId: uuid('competition_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('matches_challenge_id_uq').on(t.challengeId),
    index('matches_competition_idx').on(t.competitionId),
    index('matches_status_idx').on(t.status),
    index('matches_deadline_idx').on(t.status, t.updatedAt),
    index('matches_start_idx').on(t.status, t.scheduledStartAt),
    index('matches_confirmation_deadline_idx').on(t.status, t.confirmationDeadline),
  ],
);

/** Stake held for one player of one challenge (TA "Hold"), and how it was settled. */
export const ledgerHolds = pgTable(
  'ledger_holds',
  {
    id: uuid('id').primaryKey(),
    // Cascades: holds are bookkeeping for the challenge. Production never hard-deletes
    // challenges, matches or users (users are soft-deleted); test purges do.
    challengeId: uuid('challenge_id')
      .notNull()
      .references(() => challenges.id, { onDelete: 'cascade' }),
    matchId: uuid('match_id').references(() => matches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    currency: text('currency').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    /** 'held' | 'released' | 'refunded' */
    status: text('status').notNull().default('held'),
    holdTransactionId: uuid('hold_transaction_id').references(() => ledgerTransactions.id),
    settleTransactionId: uuid('settle_transaction_id').references(() => ledgerTransactions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ledger_holds_challenge_user_uq').on(t.challengeId, t.userId),
    index('ledger_holds_match_idx').on(t.matchId),
  ],
);

/** F13.2: every provider webhook, stored before processing; (provider, event_id) dedupes. */
export const providerWebhookEvents = pgTable(
  'provider_webhook_events',
  {
    id: uuid('id').primaryKey(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    /** 'applied' | 'ignored' | 'failed: <reason>' */
    outcome: text('outcome'),
  },
  (t) => [uniqueIndex('provider_webhook_events_uq').on(t.provider, t.eventId)],
);

/**
 * F13.3: stake caps as data. scope 'tier' keys by identity tier; scope 'restriction' keys
 * by an account restriction (e.g. 'fraud_limited' from F12.4). The effective cap is the
 * lowest active rule that applies; no tier rule means no stakes (fail closed).
 */
export const stakeLimitRules = pgTable(
  'stake_limit_rules',
  {
    id: uuid('id').primaryKey(),
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    currency: text('currency').notNull(),
    maxStakeMinor: bigint('max_stake_minor', { mode: 'number' }).notNull(),
    version: integer('version').notNull().default(1),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('stake_limit_rules_uq').on(t.scope, t.key, t.currency, t.version)],
);

/**
 * F13.5: responsible-gaming limits and self-exclusion (TA LimitSetting). Lowering a limit
 * applies at once; raising one waits out a cooling-off period (`pending_*`).
 */
export const limitSettings = pgTable('limit_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  currency: text('currency').notNull().default('NGN'),
  dailyStakeLimitMinor: bigint('daily_stake_limit_minor', { mode: 'number' }),
  weeklyStakeLimitMinor: bigint('weekly_stake_limit_minor', { mode: 'number' }),
  monthlyStakeLimitMinor: bigint('monthly_stake_limit_minor', { mode: 'number' }),
  pendingLimits: jsonb('pending_limits'),
  pendingEffectiveAt: timestamp('pending_effective_at', { withTimezone: true }),
  selfExcludedUntil: timestamp('self_excluded_until', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
    /** result | no_show | confirmation (spec §3). */
    kind: text('kind').notNull().default('result'),
    /** win | loss | draw | no_show, from the submitter's point of view. */
    result: text('result').notNull(),
    /** { self, opponent } from the submitter's point of view; {} for no_show. */
    score: jsonb('score').notNull(),
    proof: jsonb('proof'),
    uploadId: uuid('upload_id').references(() => uploads.id),
    note: text('note'),
    /** 1 in Sprint 8; corrections under the Sprint 9 dispute flow use 2+. */
    revision: integer('revision').notNull().default(1),
    idempotencyKey: uuid('idempotency_key').unique(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('result_submissions_match_idx').on(t.matchId),
    index('result_submissions_submitter_idx').on(t.submitterId),
    uniqueIndex('result_submissions_side_revision_uq').on(t.matchSideId, t.revision),
  ],
);

export const disputes = pgTable(
  'disputes',
  {
    id: uuid('id').primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    /** Null when the system opened the dispute (conflicting submissions). */
    raisedById: uuid('raised_by_id').references(() => users.id),
    /** auto_conflict | player (Sprint 9) | no_show_contested */
    source: text('source').notNull().default('player'),
    reason: text('reason').notNull(),
    /** Sprint 9 reason category for player-opened disputes (see disputes.rules.ts). */
    category: text('category'),
    /** Player's free-text detail (≤ 1000 chars). */
    detail: text('detail'),
    evidence: jsonb('evidence'),
    /** open | awaiting_info | reviewed | ruled | appealed | final (Sprint 9 tracker). */
    status: text('status').notNull().default('open'),
    ruledAt: timestamp('ruled_at', { withTimezone: true }),
    appealedAt: timestamp('appealed_at', { withTimezone: true }),
    finalAt: timestamp('final_at', { withTimezone: true }),
    /** Sprint 12 queue: the moderator who claimed it (optimistic, one claimant). */
    assignedToId: uuid('assigned_to_id').references(() => users.id),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('disputes_assigned_idx').on(t.assignedToId, t.status),
    /** One dispute per match: auto-opened conflicts and player disputes share it. */
    uniqueIndex('disputes_match_uq').on(t.matchId),
    index('disputes_raised_by_idx').on(t.raisedById),
    index('disputes_status_idx').on(t.status, t.createdAt),
  ],
);

/** Extra evidence a player attaches to a dispute (Sprint 9). Append-only. */
export const disputeEvidence = pgTable(
  'dispute_evidence',
  {
    id: uuid('id').primaryKey(),
    disputeId: uuid('dispute_id')
      .notNull()
      .references(() => disputes.id, { onDelete: 'cascade' }),
    submittedById: uuid('submitted_by_id')
      .notNull()
      .references(() => users.id),
    uploadId: uuid('upload_id').references(() => uploads.id),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('dispute_evidence_dispute_idx').on(t.disputeId),
    uniqueIndex('dispute_evidence_upload_uq').on(t.uploadId),
  ],
);

/** The single appeal a dispute allows (PRD: appeal once). */
export const disputeAppeals = pgTable(
  'dispute_appeals',
  {
    id: uuid('id').primaryKey(),
    disputeId: uuid('dispute_id')
      .notNull()
      .references(() => disputes.id, { onDelete: 'cascade' }),
    appellantId: uuid('appellant_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('dispute_appeals_dispute_uq').on(t.disputeId)],
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
    /** Outcome: side0_win | side1_win | draw | void. */
    ruling: text('ruling').notNull(),
    /** The moderator's reason, shown to both players. */
    justification: text('justification').notNull(),
    /** 1 = first ruling, 2 = ruling on the appeal (final). Append-only. */
    round: integer('round').notNull().default(1),
    /** Sanction note shown with the ruling (ladder mechanics are Sprint 12). */
    sanctionNote: text('sanction_note'),
    /** Evidence snapshot at ruling time: SHA-256 over the chat transcript, and its size. */
    chatDigest: text('chat_digest'),
    chatMessageCount: integer('chat_message_count'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('rulings_dispute_round_uq').on(t.disputeId, t.round),
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
    /** Rated result applications (Sprint 10). Drives K and the provisional flag. */
    ratedMatches: integer('rated_matches').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('game_profiles_user_game_uq').on(t.userId, t.gameId),
    index('game_profiles_user_idx').on(t.userId),
    index('game_profiles_game_idx').on(t.gameId),
    index('game_profiles_leaderboard_idx').on(t.gameId, t.rating, t.id),
  ],
);

/**
 * Generic user reports (TA Identity: Report). Sprint 6 writes them from the challenge
 * detail and player surfaces; Sprint 12 builds the triage queue and enforcement.
 * Chat messages have their own report table (with a body snapshot) in Sprint 7.
 */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    reason: text('reason').notNull(),
    note: text('note'),
    /** open | dismissed | actioned */
    status: text('status').notNull().default('open'),
    resolvedById: uuid('resolved_by_id').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolution: text('resolution'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('reports_reporter_subject_uq').on(t.reporterId, t.subjectType, t.subjectId),
    index('reports_status_idx').on(t.status, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Messaging — Sprint 7 (F7.3, F7.5)
// Conversations are scoped: one per match now, DM pairs later (Sprint 14).
// ---------------------------------------------------------------------------

export const conversationScopeEnum = pgEnum('conversation_scope', ['match', 'dm']);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    scope: conversationScopeEnum('scope').notNull(),
    /** Set when scope = 'match'. One conversation per match. */
    matchId: uuid('match_id').references(() => matches.id, { onDelete: 'cascade' }),
    /** Canonical (sorted) user pair key when scope = 'dm'. Reserved for Sprint 14. */
    dmPairKey: text('dm_pair_key'),
    /** Written by the lock sweeper once the 72h window has passed; reads also compute it. */
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('conversations_match_uq').on(t.matchId),
    uniqueIndex('conversations_dm_pair_uq').on(t.dmPairKey),
  ],
);

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** Per-conversation mute (Sprint 14 enforcement; stored now). */
    mutedAt: timestamp('muted_at', { withTimezone: true }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index('conversation_participants_user_idx').on(t.userId),
  ],
);

export const messageKindEnum = pgEnum('message_kind', ['user', 'system']);

/**
 * Range-partitioned by created_at (monthly). drizzle-kit cannot emit PARTITION BY, so
 * migration 0006 is hand-edited; the primary key must include the partition column.
 * Retried sends are deduplicated under an advisory lock on (sender, client_msg_id),
 * since a unique index cannot span partitions without created_at.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').notNull(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** Null for system messages. */
    senderId: uuid('sender_id').references(() => users.id),
    kind: messageKindEnum('kind').notNull().default('user'),
    body: text('body').notNull(),
    clientMsgId: uuid('client_msg_id'),
    flagged: boolean('flagged').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.createdAt, t.id] }),
    index('messages_conversation_created_idx').on(t.conversationId, t.createdAt, t.id),
    index('messages_sender_client_idx').on(t.senderId, t.clientMsgId),
  ],
);

export const messageReports = pgTable(
  'message_reports',
  {
    id: uuid('id').primaryKey(),
    messageId: uuid('message_id').notNull(),
    /** Partition key of the reported message, so the row can be found without a scan. */
    messageCreatedAt: timestamp('message_created_at', { withTimezone: true }).notNull(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull(),
    note: text('note'),
    /** Body at report time, so later edits/retention cannot change the evidence. */
    bodySnapshot: text('body_snapshot').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('message_reports_message_reporter_uq').on(t.messageId, t.reporterId),
    index('message_reports_status_idx').on(t.status, t.createdAt),
  ],
);

export const chatFlags = pgTable(
  'chat_flags',
  {
    id: uuid('id').primaryKey(),
    messageId: uuid('message_id').notNull(),
    messageCreatedAt: timestamp('message_created_at', { withTimezone: true }).notNull(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** Filter categories that matched, e.g. ['profanity', 'off_platform_contact']. */
    categories: jsonb('categories').notNull(),
    /** Normalised terms that matched (never the full message — that stays in messages). */
    terms: jsonb('terms').notNull(),
    filterVersion: text('filter_version').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chat_flags_status_idx').on(t.status, t.createdAt)],
);

export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index('user_blocks_blocked_idx').on(t.blockedId),
  ],
);

/**
 * Sprint 8 (F8.2): every user-supplied file. Screenshots are untrusted content
 * (Design §6): EXIF stripped on write, hashed, read through signed URLs only.
 */
export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    matchId: uuid('match_id').references(() => matches.id),
    /** result_proof | no_show_proof */
    purpose: text('purpose').notNull(),
    /** pending | ready | rejected */
    status: text('status').notNull().default('pending'),
    declaredMime: text('declared_mime').notNull(),
    declaredSize: integer('declared_size').notNull(),
    quarantineKey: text('quarantine_key').notNull(),
    storageKey: text('storage_key'),
    thumbKey: text('thumb_key'),
    mime: text('mime'),
    sizeBytes: integer('size_bytes'),
    width: integer('width'),
    height: integer('height'),
    /** SHA-256 of the bytes as uploaded (exact-reuse detection). */
    sha256: text('sha256'),
    /** SHA-256 of the stored, EXIF-stripped bytes. */
    storedSha256: text('stored_sha256'),
    /** 64-bit DCT perceptual hash, 16 hex chars. */
    phash: text('phash'),
    /** Exact-hash match on another match (upload rejected). */
    reusedUploadId: uuid('reused_upload_id'),
    /** Nearest perceptual match within threshold (accepted, flagged for review). */
    similarUploadId: uuid('similar_upload_id'),
    similarDistance: integer('similar_distance'),
    rejectReason: text('reject_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('uploads_owner_idx').on(t.ownerId, t.createdAt),
    index('uploads_match_idx').on(t.matchId),
    index('uploads_sha256_idx').on(t.sha256),
    index('uploads_phash_idx').on(t.phash),
  ],
);

/**
 * Sprint 10 (F10.1): append-only rating event log, the source of truth for ratings.
 * One row per player per application. An application ("apply") rates one match result;
 * a "reverse" undoes an earlier apply exactly (appeal rulings, Sprint 9). Every row keeps
 * the inputs replay needs, so `ratings/elo.ts#replay` can recompute every rating from
 * this table alone (PRD acceptance criterion). A trigger rejects UPDATE and DELETE.
 */
export const ratingEvents = pgTable(
  'rating_events',
  {
    id: uuid('id').primaryKey(),
    /** Global processing order; replay sorts by it. */
    seq: bigserial('seq', { mode: 'number' }).notNull().unique(),
    /** Shared by the two rows of one application or reversal. */
    applyId: uuid('apply_id').notNull(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    // Cascade only so test fixtures can purge their matches (inside raise.allow_purge);
    // matches are never deleted in production and the trigger blocks any other delete.
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    opponentId: uuid('opponent_id')
      .notNull()
      .references(() => users.id),
    /** apply | reverse */
    kind: text('kind').notNull(),
    /** result | forfeit | ruling | reversal */
    reason: text('reason').notNull(),
    /** Idempotency: the outbox event that caused this row (one row per user per source). */
    sourceKey: text('source_key').notNull(),
    /** 1 win, 0.5 draw, 0 loss (0 on reversals). */
    score: doublePrecision('score').notNull(),
    /** When the result was decided; the 7-day same-opponent window uses it. */
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
    reversesApplyId: uuid('reverses_apply_id'),
    kFactor: integer('k_factor'),
    expected: doublePrecision('expected'),
    multiplier: doublePrecision('multiplier'),
    ratingBefore: integer('rating_before').notNull(),
    delta: integer('delta').notNull(),
    ratingAfter: integer('rating_after').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('rating_events_source_user_uq').on(t.sourceKey, t.userId),
    index('rating_events_player_idx').on(t.gameId, t.userId, t.seq),
    index('rating_events_pair_idx').on(t.gameId, t.userId, t.opponentId, t.decidedAt),
    index('rating_events_match_idx').on(t.matchId),
    index('rating_events_apply_idx').on(t.applyId),
    index('rating_events_reverses_idx').on(t.reversesApplyId),
  ],
);

// ---------------------------------------------------------------------------
// Notifications — Sprint 11 (F11.1–F11.5)
// ---------------------------------------------------------------------------

/** One row per (recipient, source event, type): the source of record, created before any delivery. */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Catalog type, e.g. challenge_received, result_needs_confirmation (notifications/catalog.ts). */
    type: text('type').notNull(),
    /** Dedupe key: the outbox event id, or a synthetic key for timers (e.g. expiring:<challengeId>). */
    sourceKey: text('source_key').notNull(),
    /** Template params; the client re-renders with the same catalog (i18n). */
    params: jsonb('params').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** In-app deep link to the related object (Design §8: tapping opens it). */
    link: text('link').notNull(),
    /** Batching: messages in the same conversation fold into one unread item. */
    groupKey: text('group_key'),
    groupCount: integer('group_count').notNull().default(1),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notifications_dedupe_uq').on(t.userId, t.sourceKey, t.type),
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    index('notifications_user_unread_idx').on(t.userId, t.readAt),
  ],
);

/** Per-type channel switches. Missing row = catalog defaults. In-app is always on. */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    push: boolean('push').notNull(),
    email: boolean('email').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);

/** Quiet hours (minutes from local midnight) and timezone, per user. */
export const notificationSettings = pgTable('notification_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  quietStartMinute: integer('quiet_start_minute'),
  quietEndMinute: integer('quiet_end_minute'),
  timeZone: text('time_zone').notNull().default('Africa/Lagos'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Every attempt to deliver a notification on a channel (ops alert on failures, M4). */
export const deliveryAttempts = pgTable(
  'delivery_attempts',
  {
    id: uuid('id').primaryKey(),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    /** in_app | push | email */
    channel: text('channel').notNull(),
    /** sent | failed | skipped | deferred */
    status: text('status').notNull(),
    attempt: integer('attempt').notNull().default(1),
    detail: text('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('delivery_attempts_notification_idx').on(t.notificationId),
    index('delivery_attempts_status_idx').on(t.status, t.createdAt),
  ],
);

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    keys: jsonb('keys').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('push_subscriptions_endpoint_uq').on(t.endpoint),
    index('push_subscriptions_user_idx').on(t.userId),
  ],
);

/**
 * Sprint 12 (F12.3): reputation debts from late cancels and no-show forfeits
 * (`reputation.debt` outbox events, Sprints 6 and 8). Feeds reputation and auto-limits.
 */
export const reputationDebts = pgTable(
  'reputation_debts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** late_cancel | no_show | … (the event's reason) */
    reason: text('reason').notNull(),
    matchId: uuid('match_id'),
    /** Outbox event id: one debt per event. */
    sourceEventId: uuid('source_event_id').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('reputation_debts_user_idx').on(t.userId, t.createdAt)],
);

/** Sprint 12 (F12.2): internal moderator notes on a dispute. Never shown to players. */
export const moderatorNotes = pgTable(
  'moderator_notes',
  {
    id: uuid('id').primaryKey(),
    disputeId: uuid('dispute_id')
      .notNull()
      .references(() => disputes.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('moderator_notes_dispute_idx').on(t.disputeId, t.createdAt)],
);
