CREATE TYPE "public"."match_state" AS ENUM('open', 'accepted', 'in_progress', 'awaiting_result', 'awaiting_confirmation', 'confirmed', 'disputed', 'resolved', 'cancelled', 'expired', 'forfeited', 'voided');--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"raised_by_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"game_profile_id" uuid NOT NULL,
	"is_ready" boolean DEFAULT false NOT NULL,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_sides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"game_profile_id" uuid NOT NULL,
	"side" integer NOT NULL,
	"is_poster" boolean DEFAULT false NOT NULL,
	"is_acceptor" boolean DEFAULT false NOT NULL,
	"result" text,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"disputed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"challenge_id" uuid NOT NULL,
	"status" "match_state" DEFAULT 'accepted' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"in_progress_at" timestamp with time zone,
	"result_submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"disputed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"forfeited_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"room_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "result_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"submitter_id" uuid NOT NULL,
	"match_side_id" uuid NOT NULL,
	"result" text NOT NULL,
	"score" jsonb NOT NULL,
	"proof" jsonb,
	"note" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rulings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dispute_id" uuid NOT NULL,
	"moderator_id" uuid NOT NULL,
	"ruling" text NOT NULL,
	"justification" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raised_by_id_users_id_fk" FOREIGN KEY ("raised_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_game_profile_id_game_profiles_id_fk" FOREIGN KEY ("game_profile_id") REFERENCES "public"."game_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_sides" ADD CONSTRAINT "match_sides_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_sides" ADD CONSTRAINT "match_sides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_sides" ADD CONSTRAINT "match_sides_game_profile_id_game_profiles_id_fk" FOREIGN KEY ("game_profile_id") REFERENCES "public"."game_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_submissions" ADD CONSTRAINT "result_submissions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_submissions" ADD CONSTRAINT "result_submissions_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_submissions" ADD CONSTRAINT "result_submissions_match_side_id_match_sides_id_fk" FOREIGN KEY ("match_side_id") REFERENCES "public"."match_sides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rulings" ADD CONSTRAINT "rulings_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rulings" ADD CONSTRAINT "rulings_moderator_id_users_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disputes_match_idx" ON "disputes" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "disputes_raised_by_idx" ON "disputes" USING btree ("raised_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_participants_match_user_uq" ON "match_participants" USING btree ("match_id","user_id");--> statement-breakpoint
CREATE INDEX "match_participants_user_idx" ON "match_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_sides_match_side_uq" ON "match_sides" USING btree ("match_id","side");--> statement-breakpoint
CREATE UNIQUE INDEX "match_sides_match_user_uq" ON "match_sides" USING btree ("match_id","user_id");--> statement-breakpoint
CREATE INDEX "match_sides_user_idx" ON "match_sides" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_challenge_id_uq" ON "matches" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "matches_deadline_idx" ON "matches" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "result_submissions_match_idx" ON "result_submissions" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "result_submissions_submitter_idx" ON "result_submissions" USING btree ("submitter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rulings_dispute_id_uq" ON "rulings" USING btree ("dispute_id");--> statement-breakpoint
CREATE INDEX "rulings_moderator_idx" ON "rulings" USING btree ("moderator_id");--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_idempotency_key_unique" UNIQUE("idempotency_key");