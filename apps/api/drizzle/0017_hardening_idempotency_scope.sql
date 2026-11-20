-- Audit #6: challenge idempotency keys are unique per poster, not globally. Expand first
-- (the per-poster index is weaker, so existing rows satisfy it), then drop the global one.
CREATE UNIQUE INDEX "challenges_poster_idempotency_uq" ON "challenges" USING btree ("poster_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "challenges" DROP CONSTRAINT "challenges_idempotency_key_unique";
