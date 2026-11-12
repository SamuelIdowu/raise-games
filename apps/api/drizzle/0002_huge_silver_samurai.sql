CREATE TYPE "public"."sanction_type" AS ENUM('warning', 'suspension', 'temporary_ban', 'permanent_ban');--> statement-breakpoint
CREATE TABLE "sanctions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "sanction_type" DEFAULT 'suspension' NOT NULL,
	"reason" text NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sanctions_user_idx" ON "sanctions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sanctions_active_idx" ON "sanctions" USING btree ("user_id","starts_at","ends_at","revoked_at");