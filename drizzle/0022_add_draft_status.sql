-- Migration: Add draft status support to all treasury entities
-- This migration adds status fields and makes fields nullable for draft support

-- Add status to receipts (default to 'active' for existing records)
ALTER TABLE "receipts" ADD COLUMN "status" VARCHAR(20) DEFAULT 'active' NOT NULL;

-- Make url and pathname nullable for drafts (receipts without files yet)
ALTER TABLE "receipts" ALTER COLUMN "url" DROP NOT NULL;
ALTER TABLE "receipts" ALTER COLUMN "pathname" DROP NOT NULL;

-- Add status to minutes (default to 'active' for existing records)
ALTER TABLE "minutes" ADD COLUMN "status" VARCHAR(20) DEFAULT 'active' NOT NULL;

-- Make required fields nullable for drafts
ALTER TABLE "minutes" ALTER COLUMN "date" DROP NOT NULL;
ALTER TABLE "minutes" ALTER COLUMN "title" DROP NOT NULL;
ALTER TABLE "minutes" ALTER COLUMN "file_url" DROP NOT NULL;
ALTER TABLE "minutes" ALTER COLUMN "file_key" DROP NOT NULL;
ALTER TABLE "minutes" ALTER COLUMN "year" DROP NOT NULL;

-- Add indexes for efficient filtering by status
CREATE INDEX IF NOT EXISTS "idx_receipts_status" ON "receipts"("status");
CREATE INDEX IF NOT EXISTS "idx_minutes_status" ON "minutes"("status");
CREATE INDEX IF NOT EXISTS "idx_transactions_status" ON "transactions"("status");
CREATE INDEX IF NOT EXISTS "idx_purchases_status" ON "purchases"("status");
CREATE INDEX IF NOT EXISTS "idx_fund_budgets_status" ON "fund_budgets"("status");
CREATE INDEX IF NOT EXISTS "idx_inventory_items_status" ON "inventory_items"("status");

-- Add composite indexes for common queries (active items by user)
CREATE INDEX IF NOT EXISTS "idx_receipts_status_created_by" ON "receipts"("status", "created_by");
CREATE INDEX IF NOT EXISTS "idx_minutes_status_created_by" ON "minutes"("status", "created_by");
CREATE INDEX IF NOT EXISTS "idx_transactions_status_created_by" ON "transactions"("status", "created_by");
CREATE INDEX IF NOT EXISTS "idx_purchases_status_created_by" ON "purchases"("status", "created_by");

-- Add comments explaining status values
COMMENT ON COLUMN "receipts"."status" IS 'draft: unsaved/incomplete, active: normal state, archived: soft deleted';
COMMENT ON COLUMN "minutes"."status" IS 'draft: unsaved/incomplete, active: normal state, archived: soft deleted';
COMMENT ON COLUMN "transactions"."status" IS 'draft: unsaved/incomplete, pending: awaiting action, complete: finalized, paused: on hold, declined: rejected';
COMMENT ON COLUMN "purchases"."status" IS 'draft: unsaved/incomplete, pending: awaiting approval, approved: approved, reimbursed: paid, rejected: not approved';
COMMENT ON COLUMN "fund_budgets"."status" IS 'draft: unsaved/incomplete, open: funds reserved, closed: budget closed';
COMMENT ON COLUMN "inventory_items"."status" IS 'draft: unsaved/incomplete, active: in use, removed: soft deleted, legacy: pre-existing item';
