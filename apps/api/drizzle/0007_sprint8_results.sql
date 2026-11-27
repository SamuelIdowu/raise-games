CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"match_id" uuid,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"declared_mime" text NOT NULL,
	"declared_size" integer NOT NULL,
	"quarantine_key" text NOT NULL,
	"storage_key" text,
	"thumb_key" text,
	"mime" text,
	"size_bytes" integer,
	"width" integer,
	"height" integer,
	"sha256" text,
	"stored_sha256" text,
	"phash" text,
	"reused_upload_id" uuid,
	"similar_upload_id" uuid,
	"similar_distance" integer,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "raised_by_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "source" text DEFAULT 'player' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "result_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "confirmation_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "winner_side" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "decided_via" text;--> statement-breakpoint
ALTER TABLE "result_submissions" ADD COLUMN "kind" text DEFAULT 'result' NOT NULL;--> statement-breakpoint
ALTER TABLE "result_submissions" ADD COLUMN "upload_id" uuid;--> statement-breakpoint
ALTER TABLE "result_submissions" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "result_submissions" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uploads_owner_idx" ON "uploads" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "uploads_match_idx" ON "uploads" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "uploads_sha256_idx" ON "uploads" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "uploads_phash_idx" ON "uploads" USING btree ("phash");--> statement-breakpoint
ALTER TABLE "result_submissions" ADD CONSTRAINT "result_submissions_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_confirmation_deadline_idx" ON "matches" USING btree ("status","confirmation_deadline");--> statement-breakpoint
CREATE UNIQUE INDEX "result_submissions_side_revision_uq" ON "result_submissions" USING btree ("match_side_id","revision");--> statement-breakpoint
ALTER TABLE "result_submissions" ADD CONSTRAINT "result_submissions_idempotency_key_unique" UNIQUE("idempotency_key");--> statement-breakpoint
-- HAND-EDITED (Sprint 8): value checks and the append-only guard (TA: ResultSubmission is append-only).
ALTER TABLE "result_submissions" ADD CONSTRAINT "result_submissions_kind_ck" CHECK ("kind" IN ('result', 'no_show', 'confirmation'));--> statement-breakpoint
ALTER TABLE "result_submissions" ADD CONSTRAINT "result_submissions_result_ck" CHECK ("result" IN ('win', 'loss', 'draw', 'no_show'));--> statement-breakpoint
ALTER TABLE "result_submissions" ADD CONSTRAINT "result_submissions_note_len_ck" CHECK ("note" IS NULL OR char_length("note") <= 200);--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_status_ck" CHECK ("status" IN ('pending', 'ready', 'rejected'));--> statement-breakpoint
-- TA: ResultSubmission is append-only. Corrections are new rows (revision 2+) under the dispute flow.
-- The only escape hatch is a transaction-local setting used by test fixtures to purge their own rows.
CREATE OR REPLACE FUNCTION result_submissions_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('raise.allow_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'result_submissions is append-only (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER result_submissions_append_only
  BEFORE UPDATE OR DELETE ON "result_submissions"
  FOR EACH ROW EXECUTE FUNCTION result_submissions_append_only();
