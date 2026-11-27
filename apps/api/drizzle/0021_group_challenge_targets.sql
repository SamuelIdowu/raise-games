CREATE TABLE "challenge_targets" (
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"declined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_targets_challenge_id_user_id_pk" PRIMARY KEY("challenge_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "challenge_targets" ADD CONSTRAINT "challenge_targets_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_targets" ADD CONSTRAINT "challenge_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_targets_user_idx" ON "challenge_targets" USING btree ("user_id","declined_at");