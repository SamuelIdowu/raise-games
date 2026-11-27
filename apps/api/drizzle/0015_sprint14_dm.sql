CREATE TABLE "friend_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"requester_id" uuid NOT NULL,
	"addressee_id" uuid NOT NULL,
	"pair_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "message_report_contexts" (
	"report_id" uuid PRIMARY KEY NOT NULL,
	"messages" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_addressee_id_users_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_report_contexts" ADD CONSTRAINT "message_report_contexts_report_id_message_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."message_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_live_pair_uq" ON "friend_requests" USING btree ("pair_key") WHERE "friend_requests"."status" in ('pending', 'accepted');--> statement-breakpoint
CREATE INDEX "friend_requests_addressee_idx" ON "friend_requests" USING btree ("addressee_id","status");--> statement-breakpoint
CREATE INDEX "friend_requests_requester_idx" ON "friend_requests" USING btree ("requester_id","status");--> statement-breakpoint
-- Sprint 14 (F14.1): restricted DMs ship default-off. An admin turns them on from the
-- Flags page; while off, every /dm route and DM screen answers 404.
INSERT INTO "feature_flags" ("id", "key", "stage", "jurisdiction", "enabled")
SELECT '01a1f000-0000-7000-8000-000000000301'::uuid, 'messaging.dm', '1', NULL, false
WHERE NOT EXISTS (
  SELECT 1 FROM "feature_flags" f
  WHERE f.key = 'messaging.dm' AND f.stage = '1' AND f.jurisdiction IS NULL
);
