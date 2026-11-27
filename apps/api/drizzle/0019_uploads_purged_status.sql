-- Audit B28: retention purges a screenshot file but keeps the upload row (and its hashes,
-- for reused-screenshot detection) with status 'purged'. Widening the check is additive.
ALTER TABLE "uploads" DROP CONSTRAINT "uploads_status_ck";--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_status_ck" CHECK ("status" IN ('pending', 'ready', 'rejected', 'purged'));
