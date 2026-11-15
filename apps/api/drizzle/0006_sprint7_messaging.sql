CREATE TYPE "public"."conversation_scope" AS ENUM('match', 'dm');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TABLE "chat_flags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"message_id" uuid NOT NULL,
	"message_created_at" timestamp with time zone NOT NULL,
	"conversation_id" uuid NOT NULL,
	"categories" jsonb NOT NULL,
	"terms" jsonb NOT NULL,
	"filter_version" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"muted_at" timestamp with time zone,
	"last_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" "conversation_scope" NOT NULL,
	"match_id" uuid,
	"dm_pair_key" text,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"message_id" uuid NOT NULL,
	"message_created_at" timestamp with time zone NOT NULL,
	"conversation_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"body_snapshot" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid,
	"kind" "message_kind" DEFAULT 'user' NOT NULL,
	"body" text NOT NULL,
	"client_msg_id" uuid,
	"flagged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_created_at_id_pk" PRIMARY KEY("created_at","id")
) PARTITION BY RANGE ("created_at");
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
ALTER TABLE "chat_flags" ADD CONSTRAINT "chat_flags_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_flags_status_idx" ON "chat_flags" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "conversation_participants_user_idx" ON "conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_match_uq" ON "conversations" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_dm_pair_uq" ON "conversations" USING btree ("dm_pair_key");--> statement-breakpoint
CREATE UNIQUE INDEX "message_reports_message_reporter_uq" ON "message_reports" USING btree ("message_id","reporter_id");--> statement-breakpoint
CREATE INDEX "message_reports_status_idx" ON "message_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "messages_sender_client_idx" ON "messages" USING btree ("sender_id","client_msg_id");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" USING btree ("blocked_id");--> statement-breakpoint
-- HAND-EDITED (Sprint 7, F7.5): drizzle-kit cannot emit partitioning. Monthly range
-- partitions, created ahead of time by ensure_message_partitions(), which the API's
-- partition job calls daily. The DEFAULT partition catches anything outside the
-- created ranges so an insert never fails; rows in it are a signal the job is behind.
CREATE TABLE "messages_default" PARTITION OF "messages" DEFAULT;--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_message_partitions(months_ahead integer DEFAULT 2)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  month_start date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  part_start date;
  part_end date;
  lo timestamptz;
  hi timestamptz;
  part_name text;
  created integer := 0;
BEGIN
  FOR i IN 0..months_ahead LOOP
    part_start := (month_start + make_interval(months => i))::date;
    part_end := (part_start + interval '1 month')::date;
    -- Bounds are UTC month boundaries regardless of the session TimeZone.
    lo := (part_start::text || ' 00:00:00+00')::timestamptz;
    hi := (part_end::text || ' 00:00:00+00')::timestamptz;
    part_name := format('messages_%s', to_char(part_start, 'YYYY_MM'));
    IF to_regclass(format('public.%I', part_name)) IS NULL THEN
      -- Rows that already landed in the DEFAULT partition for this range would make
      -- CREATE ... PARTITION OF fail, so move them out and back in around the create.
      CREATE TEMP TABLE IF NOT EXISTS _messages_moving (LIKE messages) ON COMMIT DROP;
      WITH moved AS (
        DELETE FROM messages_default WHERE created_at >= lo AND created_at < hi RETURNING *
      )
      INSERT INTO _messages_moving SELECT * FROM moved;
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF messages FOR VALUES FROM (%L) TO (%L)',
        part_name, lo, hi
      );
      INSERT INTO messages SELECT * FROM _messages_moving;
      TRUNCATE _messages_moving;
      created := created + 1;
    END IF;
  END LOOP;
  RETURN created;
END;
$$;--> statement-breakpoint
SELECT ensure_message_partitions(2);
