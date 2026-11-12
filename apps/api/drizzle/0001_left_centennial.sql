CREATE TABLE "game_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"in_game_id" text NOT NULL,
	"city" text,
	"campus" text,
	"rating" integer DEFAULT 1000 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"provisional" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "game_profiles" ADD CONSTRAINT "game_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_profiles" ADD CONSTRAINT "game_profiles_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_profiles_user_game_uq" ON "game_profiles" USING btree ("user_id","game_id");--> statement-breakpoint
CREATE INDEX "game_profiles_user_idx" ON "game_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "game_profiles_game_idx" ON "game_profiles" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "sessions_family_idx" ON "sessions" USING btree ("family_id");