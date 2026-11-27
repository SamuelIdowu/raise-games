CREATE TABLE "beta_waitlist" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"place" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_at" timestamp with time zone,
	"invite_code_id" uuid
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"page" text,
	"app_version" text,
	"user_agent" text,
	"severity" text,
	"status" text DEFAULT 'new' NOT NULL,
	"note" text,
	"triaged_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"cohort" text NOT NULL,
	"place" text,
	"max_uses" integer DEFAULT 50 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_redemptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"code_id" uuid NOT NULL,
	"cohort" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "beta_waitlist" ADD CONSTRAINT "beta_waitlist_invite_code_id_invite_codes_id_fk" FOREIGN KEY ("invite_code_id") REFERENCES "public"."invite_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_triaged_by_id_users_id_fk" FOREIGN KEY ("triaged_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_code_id_invite_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."invite_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "beta_waitlist_phone_uq" ON "beta_waitlist" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "feedback_status_idx" ON "feedback" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "feedback_open_severity_idx" ON "feedback" USING btree ("severity") WHERE "feedback"."status" in ('new', 'triaged');--> statement-breakpoint
CREATE UNIQUE INDEX "invite_codes_code_uq" ON "invite_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "invite_codes_cohort_idx" ON "invite_codes" USING btree ("cohort");--> statement-breakpoint
CREATE INDEX "invite_redemptions_cohort_idx" ON "invite_redemptions" USING btree ("cohort");--> statement-breakpoint
-- Sprint 16 (F16.1): the closed-beta gate ships off (dev, CI and e2e sign up freely).
-- An admin turns it on to require invite codes for new accounts.
INSERT INTO "feature_flags" ("id", "key", "stage", "jurisdiction", "enabled")
SELECT '01a1f000-0000-7000-8000-000000000401'::uuid, 'beta.invite_only', '1', NULL, false
WHERE NOT EXISTS (
  SELECT 1 FROM "feature_flags" f
  WHERE f.key = 'beta.invite_only' AND f.stage = '1' AND f.jurisdiction IS NULL
);
