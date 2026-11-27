DROP INDEX "ledger_entries_idempotency_uq";--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP COLUMN "entry_type";--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP COLUMN "idempotency_key";--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP COLUMN "meta";