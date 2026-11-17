CREATE TABLE "rating_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"apply_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"opponent_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"source_key" text NOT NULL,
	"score" double precision NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"reverses_apply_id" uuid,
	"k_factor" integer,
	"expected" double precision,
	"multiplier" double precision,
	"rating_before" integer NOT NULL,
	"delta" integer NOT NULL,
	"rating_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_events_seq_unique" UNIQUE("seq")
);
--> statement-breakpoint
ALTER TABLE "game_profiles" ADD COLUMN "rated_matches" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rating_events" ADD CONSTRAINT "rating_events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_events" ADD CONSTRAINT "rating_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_events" ADD CONSTRAINT "rating_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_events" ADD CONSTRAINT "rating_events_opponent_id_users_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rating_events_source_user_uq" ON "rating_events" USING btree ("source_key","user_id");--> statement-breakpoint
CREATE INDEX "rating_events_player_idx" ON "rating_events" USING btree ("game_id","user_id","seq");--> statement-breakpoint
CREATE INDEX "rating_events_pair_idx" ON "rating_events" USING btree ("game_id","user_id","opponent_id","decided_at");--> statement-breakpoint
CREATE INDEX "rating_events_match_idx" ON "rating_events" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "rating_events_apply_idx" ON "rating_events" USING btree ("apply_id");--> statement-breakpoint
CREATE INDEX "rating_events_reverses_idx" ON "rating_events" USING btree ("reverses_apply_id");--> statement-breakpoint
CREATE INDEX "game_profiles_leaderboard_idx" ON "game_profiles" USING btree ("game_id","rating","id");--> statement-breakpoint
ALTER TABLE "rating_events" ADD CONSTRAINT "rating_events_kind_ck" CHECK ("kind" IN ('apply', 'reverse'));--> statement-breakpoint
ALTER TABLE "rating_events" ADD CONSTRAINT "rating_events_reason_ck" CHECK ("reason" IN ('result', 'forfeit', 'ruling', 'reversal'));--> statement-breakpoint
ALTER TABLE "rating_events" ADD CONSTRAINT "rating_events_score_ck" CHECK ("score" IN (0, 0.5, 1));--> statement-breakpoint
-- PRD: ratings must be recomputable from the event log, so the log is append-only.
-- Same escape hatch as result_submissions: a transaction-local setting for test purges.
CREATE OR REPLACE FUNCTION rating_events_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('raise.allow_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'rating_events is append-only (% rejected)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER rating_events_append_only
  BEFORE UPDATE OR DELETE ON "rating_events"
  FOR EACH ROW EXECUTE FUNCTION rating_events_append_only();
