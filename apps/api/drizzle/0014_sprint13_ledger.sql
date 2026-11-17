CREATE TABLE "ledger_holds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"challenge_id" uuid NOT NULL,
	"match_id" uuid,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"hold_transaction_id" uuid,
	"settle_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"kind" text NOT NULL,
	"currency" text NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"reverses_transaction_id" uuid,
	"request_hash" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "limit_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"daily_stake_limit_minor" bigint,
	"weekly_stake_limit_minor" bigint,
	"monthly_stake_limit_minor" bigint,
	"pending_limits" jsonb,
	"pending_effective_at" timestamp with time zone,
	"self_excluded_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"outcome" text
);
--> statement-breakpoint
CREATE TABLE "stake_limit_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"currency" text NOT NULL,
	"max_stake_minor" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ALTER COLUMN "amount_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD COLUMN "balance_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD COLUMN "allow_negative" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "transaction_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "currency" text NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "competition_id" uuid;--> statement-breakpoint
ALTER TABLE "ledger_holds" ADD CONSTRAINT "ledger_holds_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_holds" ADD CONSTRAINT "ledger_holds_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_holds" ADD CONSTRAINT "ledger_holds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_holds" ADD CONSTRAINT "ledger_holds_hold_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("hold_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_holds" ADD CONSTRAINT "ledger_holds_settle_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("settle_transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limit_settings" ADD CONSTRAINT "limit_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_holds_challenge_user_uq" ON "ledger_holds" USING btree ("challenge_id","user_id");--> statement-breakpoint
CREATE INDEX "ledger_holds_match_idx" ON "ledger_holds" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_idempotency_uq" ON "ledger_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_reverses_uq" ON "ledger_transactions" USING btree ("reverses_transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_reference_idx" ON "ledger_transactions" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_webhook_events_uq" ON "provider_webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stake_limit_rules_uq" ON "stake_limit_rules" USING btree ("scope","key","currency","version");--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_accounts_owner_idx" ON "ledger_accounts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "matches_competition_idx" ON "matches" USING btree ("competition_id");--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_reverses_fk" FOREIGN KEY ("reverses_transaction_id") REFERENCES "public"."ledger_transactions"("id");--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_kind_ck" CHECK ("kind" IN ('hold', 'release', 'refund', 'deposit', 'withdrawal', 'reversal', 'adjustment'));--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_currency_ck" CHECK ("currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_currency_ck" CHECK ("currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_type_ck" CHECK ("account_type" IN ('user_available', 'user_held', 'platform_fee', 'provider_clearing'));--> statement-breakpoint
-- Money never goes below zero except in clearing accounts (they mirror funds held outside).
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_non_negative_ck" CHECK ("allow_negative" OR "balance_minor" >= 0);--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_non_zero_ck" CHECK ("amount_minor" <> 0);--> statement-breakpoint
ALTER TABLE "ledger_holds" ADD CONSTRAINT "ledger_holds_status_ck" CHECK ("status" IN ('held', 'released', 'refunded'));--> statement-breakpoint
ALTER TABLE "ledger_holds" ADD CONSTRAINT "ledger_holds_amount_ck" CHECK ("amount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "stake_limit_rules" ADD CONSTRAINT "stake_limit_rules_scope_ck" CHECK ("scope" IN ('tier', 'restriction'));--> statement-breakpoint
ALTER TABLE "stake_limit_rules" ADD CONSTRAINT "stake_limit_rules_max_ck" CHECK ("max_stake_minor" >= 0);--> statement-breakpoint
ALTER TABLE "limit_settings" ADD CONSTRAINT "limit_settings_limits_ck" CHECK (
  coalesce("daily_stake_limit_minor", 0) >= 0
  AND coalesce("weekly_stake_limit_minor", 0) >= 0
  AND coalesce("monthly_stake_limit_minor", 0) >= 0
);--> statement-breakpoint
-- TA: ledger entries are immutable; corrections are reversing transactions. Same purge
-- escape hatch as the other append-only tables (transaction-local, DELETE only, tests).
CREATE OR REPLACE FUNCTION ledger_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('raise.allow_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only (% rejected)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();--> statement-breakpoint
CREATE TRIGGER ledger_transactions_append_only
  BEFORE UPDATE OR DELETE ON "ledger_transactions"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();--> statement-breakpoint
-- Double entry, enforced by the database at commit: a transaction's entries sum to zero and
-- every entry matches the transaction's and the account's currency.
CREATE OR REPLACE FUNCTION ledger_transaction_balanced() RETURNS trigger AS $$
DECLARE
  total numeric;
  bad integer;
BEGIN
  SELECT coalesce(sum(amount_minor), 0) INTO total
    FROM ledger_entries WHERE transaction_id = NEW.transaction_id;
  IF total <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced (sum %)', NEW.transaction_id, total
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) INTO bad
    FROM ledger_entries e
    JOIN ledger_transactions t ON t.id = e.transaction_id
    JOIN ledger_accounts a ON a.id = e.account_id
   WHERE e.transaction_id = NEW.transaction_id
     AND (e.currency <> t.currency OR e.currency <> a.currency);
  IF bad > 0 THEN
    RAISE EXCEPTION 'ledger transaction % mixes currencies', NEW.transaction_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_transaction_balanced();--> statement-breakpoint
-- Reference data. Stage 1 is free: fee schedule v1 charges nothing. The Stage 2 schedule is
-- an open owner decision, seeded inactive so nothing can use it by accident.
INSERT INTO "fee_rules" ("id", "version", "currency", "params", "active") VALUES
  ('01a1f000-0000-7000-8000-000000000001', 1, 'NGN', '{"feeBps": 0, "stage": 1, "note": "Stage 1: no fees"}', true),
  ('01a1f000-0000-7000-8000-000000000002', 2, 'NGN', '{"feeBps": null, "stakeBands": [], "status": "owner_decision_pending"}', false)
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Placeholder caps (owner decision "stake-tier limits"); new accounts start low. Real-money
-- stakes stay off until the Stage 2 flag is on, so these only matter from Stage 2.
INSERT INTO "stake_limit_rules" ("id", "scope", "key", "currency", "max_stake_minor") VALUES
  ('01a1f000-0000-7000-8000-000000000101', 'tier', 'tier0_unverified', 'NGN', 0),
  ('01a1f000-0000-7000-8000-000000000102', 'tier', 'tier1_phone_verified', 'NGN', 100000),
  ('01a1f000-0000-7000-8000-000000000103', 'tier', 'tier2_kyc', 'NGN', 1000000),
  ('01a1f000-0000-7000-8000-000000000104', 'tier', 'tier3_kyc_plus', 'NGN', 5000000),
  ('01a1f000-0000-7000-8000-000000000105', 'restriction', 'fraud_limited', 'NGN', 0),
  ('01a1f000-0000-7000-8000-000000000106', 'restriction', 'self_excluded', 'NGN', 0)
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Jurisdiction flags (F13.4). A null jurisdiction is the default for every state; a row for
-- a specific state overrides it. Everything money-related is off.
INSERT INTO "feature_flags" ("id", "key", "stage", "jurisdiction", "enabled")
SELECT v.id::uuid, v.key, v.stage, NULL, v.enabled
FROM (VALUES
  ('01a1f000-0000-7000-8000-000000000201', 'currency:NGN', '1', true),
  ('01a1f000-0000-7000-8000-000000000202', 'currency:NGN', '2', true),
  ('01a1f000-0000-7000-8000-000000000203', 'real_money_stakes', '2', false),
  ('01a1f000-0000-7000-8000-000000000204', 'live_wallet_provider', '2', false),
  ('01a1f000-0000-7000-8000-000000000205', 'responsible_gaming_settings', '2', false)
) AS v(id, key, stage, enabled)
WHERE NOT EXISTS (
  SELECT 1 FROM "feature_flags" f
  WHERE f.key = v.key AND f.stage = v.stage AND f.jurisdiction IS NULL
);
