CREATE TYPE "public"."challenge_status" AS ENUM('open', 'accepted', 'in_progress', 'awaiting_result', 'awaiting_confirmation', 'confirmed', 'disputed', 'resolved', 'cancelled', 'expired', 'forfeited', 'voided');--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"format_id" uuid NOT NULL,
	"poster_id" uuid NOT NULL,
	"target_player_id" uuid,
	"status" "challenge_status" DEFAULT 'open' NOT NULL,
	"rules" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"acceptance_deadline" timestamp with time zone NOT NULL,
	"stake_amount_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"fee_schedule_version" integer DEFAULT 1 NOT NULL,
	"rating_gap" integer,
	"repeat_pair_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"accepted_by_id" uuid,
	"accepted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairing_counters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" uuid NOT NULL,
	"user_a_id" uuid NOT NULL,
	"user_b_id" uuid NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"last_pairing_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_format_id_game_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."game_formats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_poster_id_users_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_target_player_id_users_id_fk" FOREIGN KEY ("target_player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_accepted_by_id_users_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_counters" ADD CONSTRAINT "pairing_counters_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_counters" ADD CONSTRAINT "pairing_counters_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_counters" ADD CONSTRAINT "pairing_counters_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenges_board_idx" ON "challenges" USING btree ("status","created_at","id");--> statement-breakpoint
CREATE INDEX "challenges_game_board_idx" ON "challenges" USING btree ("game_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "challenges_poster_idx" ON "challenges" USING btree ("poster_id","created_at");--> statement-breakpoint
CREATE INDEX "challenges_target_idx" ON "challenges" USING btree ("target_player_id","status");--> statement-breakpoint
CREATE INDEX "challenges_deadline_idx" ON "challenges" USING btree ("status","acceptance_deadline");--> statement-breakpoint
CREATE UNIQUE INDEX "pairing_counters_game_pair_uq" ON "pairing_counters" USING btree ("game_id","user_a_id","user_b_id");--> statement-breakpoint
CREATE INDEX "pairing_counters_a_idx" ON "pairing_counters" USING btree ("user_a_id");--> statement-breakpoint
CREATE INDEX "pairing_counters_b_idx" ON "pairing_counters" USING btree ("user_b_id");