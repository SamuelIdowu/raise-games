CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reporter_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "scheduled_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_reporter_subject_uq" ON "reports" USING btree ("reporter_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "matches_start_idx" ON "matches" USING btree ("status","scheduled_start_at");--> statement-breakpoint
-- HAND-EDITED (Sprint 6, F6.1/F6.5). Backfill the agreed start for existing matches.
UPDATE "matches" m SET "scheduled_start_at" = c."starts_at"
FROM "challenges" c WHERE c."id" = m."challenge_id" AND m."scheduled_start_at" IS NULL;--> statement-breakpoint
-- Transition guards: the DB refuses illegal status changes even from raw SQL (TA "Match
-- state machine": enforced in the domain layer and checked in the database). Mirrors
-- MATCH_TRANSITIONS / CHALLENGE_TRANSITIONS in packages/types; keep them in sync.
CREATE OR REPLACE FUNCTION raise_match_transition_allowed(from_state text, to_state text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE from_state
    WHEN 'open' THEN to_state IN ('accepted','cancelled','expired')
    WHEN 'accepted' THEN to_state IN ('in_progress','awaiting_result','awaiting_confirmation','cancelled','expired','forfeited','voided')
    WHEN 'in_progress' THEN to_state IN ('awaiting_result','awaiting_confirmation','cancelled','forfeited','voided')
    WHEN 'awaiting_result' THEN to_state IN ('awaiting_confirmation','expired','forfeited','voided')
    WHEN 'awaiting_confirmation' THEN to_state IN ('confirmed','disputed','forfeited','voided')
    WHEN 'disputed' THEN to_state IN ('resolved','voided')
    WHEN 'confirmed' THEN to_state IN ('voided')
    WHEN 'resolved' THEN to_state IN ('voided')
    WHEN 'forfeited' THEN to_state IN ('voided')
    ELSE false
  END
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION raise_challenge_transition_allowed(from_state text, to_state text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE from_state
    WHEN 'open' THEN to_state IN ('accepted','cancelled','expired')
    WHEN 'accepted' THEN to_state IN ('cancelled')
    ELSE false
  END
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION raise_guard_status_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed boolean;
BEGIN
  IF TG_TABLE_NAME = 'matches' THEN
    allowed := raise_match_transition_allowed(OLD.status::text, NEW.status::text);
  ELSE
    allowed := raise_challenge_transition_allowed(OLD.status::text, NEW.status::text);
  END IF;
  IF NOT allowed THEN
    RAISE EXCEPTION 'illegal % status transition: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER matches_status_transition_guard
  BEFORE UPDATE OF "status" ON "matches"
  FOR EACH ROW WHEN (OLD."status" IS DISTINCT FROM NEW."status")
  EXECUTE FUNCTION raise_guard_status_transition();--> statement-breakpoint
CREATE TRIGGER challenges_status_transition_guard
  BEFORE UPDATE OF "status" ON "challenges"
  FOR EACH ROW WHEN (OLD."status" IS DISTINCT FROM NEW."status")
  EXECUTE FUNCTION raise_guard_status_transition();
