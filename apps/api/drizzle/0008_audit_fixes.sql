CREATE TABLE "outbox_deliveries" (
	"consumer" text NOT NULL,
	"event_id" uuid NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_deliveries_consumer_event_id_pk" PRIMARY KEY("consumer","event_id")
);
--> statement-breakpoint
ALTER TABLE "game_formats" ADD COLUMN "status" text DEFAULT 'enabled' NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_deliveries" ADD CONSTRAINT "outbox_deliveries_event_id_outbox_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."outbox_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_deliveries_status_idx" ON "outbox_deliveries" USING btree ("consumer","status");--> statement-breakpoint
CREATE INDEX "outbox_created_idx" ON "outbox_events" USING btree ("created_at","id");--> statement-breakpoint
-- Backfill: events the old single-flag relay already handled count as delivered to the
-- two consumers that existed then, so they are not replayed. New consumers (ratings,
-- notifications) start fresh and see every event inside the relay's lookback window.
INSERT INTO "outbox_deliveries" ("consumer", "event_id", "status", "attempts")
SELECT c.consumer, e.id, 'done', 1
FROM "outbox_events" e
CROSS JOIN (VALUES ('match-state-broadcast'), ('match-chat-create')) AS c(consumer)
WHERE e.processed_at IS NOT NULL
ON CONFLICT DO NOTHING;
