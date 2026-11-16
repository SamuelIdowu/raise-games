CREATE TABLE "dispute_appeals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dispute_id" uuid NOT NULL,
	"appellant_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute_evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dispute_id" uuid NOT NULL,
	"submitted_by_id" uuid NOT NULL,
	"upload_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "disputes_match_idx";--> statement-breakpoint
DROP INDEX "rulings_dispute_id_uq";--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "detail" text;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "ruled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "appealed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "final_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rulings" ADD COLUMN "round" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "rulings" ADD COLUMN "sanction_note" text;--> statement-breakpoint
ALTER TABLE "rulings" ADD COLUMN "chat_digest" text;--> statement-breakpoint
ALTER TABLE "rulings" ADD COLUMN "chat_message_count" integer;--> statement-breakpoint
ALTER TABLE "dispute_appeals" ADD CONSTRAINT "dispute_appeals_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_appeals" ADD CONSTRAINT "dispute_appeals_appellant_id_users_id_fk" FOREIGN KEY ("appellant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dispute_appeals_dispute_uq" ON "dispute_appeals" USING btree ("dispute_id");--> statement-breakpoint
CREATE INDEX "dispute_evidence_dispute_idx" ON "dispute_evidence" USING btree ("dispute_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dispute_evidence_upload_uq" ON "dispute_evidence" USING btree ("upload_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_match_uq" ON "disputes" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rulings_dispute_round_uq" ON "rulings" USING btree ("dispute_id","round");--> statement-breakpoint
-- HAND-EDITED (Sprint 9): value checks and append-only rulings/evidence/appeals (TA: Ruling is
-- append-only; corrections are a new round). Test fixtures may purge via raise.allow_purge.
ALTER TABLE "rulings" ADD CONSTRAINT "rulings_outcome_ck" CHECK ("ruling" IN ('side0_win', 'side1_win', 'draw', 'void'));--> statement-breakpoint
ALTER TABLE "rulings" ADD CONSTRAINT "rulings_round_ck" CHECK ("round" IN (1, 2));--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_status_ck" CHECK ("status" IN ('open', 'awaiting_info', 'reviewed', 'ruled', 'appealed', 'final'));--> statement-breakpoint
CREATE OR REPLACE FUNCTION raise_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('raise.allow_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only (% rejected)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER rulings_append_only BEFORE UPDATE OR DELETE ON "rulings"
  FOR EACH ROW EXECUTE FUNCTION raise_append_only();--> statement-breakpoint
CREATE TRIGGER dispute_evidence_append_only BEFORE UPDATE OR DELETE ON "dispute_evidence"
  FOR EACH ROW EXECUTE FUNCTION raise_append_only();--> statement-breakpoint
CREATE TRIGGER dispute_appeals_append_only BEFORE UPDATE OR DELETE ON "dispute_appeals"
  FOR EACH ROW EXECUTE FUNCTION raise_append_only();
