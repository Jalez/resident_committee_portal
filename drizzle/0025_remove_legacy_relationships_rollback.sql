-- ============================================
-- Rollback: Restore Legacy FKs and Junction Tables
-- Use this ONLY if migration 0025 causes issues
-- 
-- WARNING: This only restores the STRUCTURE. Data will need to be
-- repopulated from entity_relationships or restored from backup.
-- ============================================

-- ============================================
-- 1. Restore columns to transactions table
-- ============================================
ALTER TABLE "transactions" 
ADD COLUMN IF NOT EXISTS "purchase_id" uuid REFERENCES "purchases"("id");

-- Recreate index
CREATE INDEX IF NOT EXISTS "transactions_purchase_id_idx" ON "transactions" ("purchase_id");

-- ============================================
-- 2. Restore columns to receipts table
-- ============================================
ALTER TABLE "receipts" 
ADD COLUMN IF NOT EXISTS "purchase_id" uuid REFERENCES "purchases"("id");

-- Recreate index
CREATE INDEX IF NOT EXISTS "receipts_purchase_id_idx" ON "receipts" ("purchase_id");

-- ============================================
-- 3. Restore inventory_item_transactions junction table
-- ============================================
CREATE TABLE IF NOT EXISTS "inventory_item_transactions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "inventory_item_id" uuid REFERENCES "inventory_items"("id") ON DELETE CASCADE NOT NULL,
    "transaction_id" uuid REFERENCES "transactions"("id") ON DELETE CASCADE NOT NULL,
    "quantity" integer NOT NULL DEFAULT 1,
    "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create unique constraint
ALTER TABLE "inventory_item_transactions" 
DROP CONSTRAINT IF EXISTS "inventory_item_transactions_inventory_item_id_transaction_id_unique";

ALTER TABLE "inventory_item_transactions" 
ADD CONSTRAINT "inventory_item_transactions_inventory_item_id_transaction_id_unique" 
UNIQUE ("inventory_item_id", "transaction_id");

-- ============================================
-- 4. Restore budget_transactions junction table
-- ============================================
CREATE TABLE IF NOT EXISTS "budget_transactions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "budget_id" uuid REFERENCES "fund_budgets"("id") ON DELETE CASCADE NOT NULL,
    "transaction_id" uuid REFERENCES "transactions"("id") ON DELETE CASCADE NOT NULL,
    "amount" decimal(10, 2) NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create unique constraint
ALTER TABLE "budget_transactions" 
DROP CONSTRAINT IF EXISTS "budget_transactions_budget_id_transaction_id_unique";

ALTER TABLE "budget_transactions" 
ADD CONSTRAINT "budget_transactions_budget_id_transaction_id_unique" 
UNIQUE ("budget_id", "transaction_id");

-- Create indexes
CREATE INDEX IF NOT EXISTS "budget_transactions_budget_id_idx" ON "budget_transactions" ("budget_id");
CREATE INDEX IF NOT EXISTS "budget_transactions_transaction_id_idx" ON "budget_transactions" ("transaction_id");

-- ============================================
-- 5. Restore minute_links junction table
-- ============================================
CREATE TABLE IF NOT EXISTS "minute_links" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "minute_id" uuid REFERENCES "minutes"("id") ON DELETE CASCADE NOT NULL,
    "purchase_id" uuid REFERENCES "purchases"("id") ON DELETE SET NULL,
    "news_id" uuid REFERENCES "news"("id") ON DELETE SET NULL,
    "inventory_item_id" uuid REFERENCES "inventory_items"("id") ON DELETE SET NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "minute_links_minute_id_idx" ON "minute_links" ("minute_id");
CREATE INDEX IF NOT EXISTS "minute_links_purchase_id_idx" ON "minute_links" ("purchase_id");
CREATE INDEX IF NOT EXISTS "minute_links_news_id_idx" ON "minute_links" ("news_id");
CREATE INDEX IF NOT EXISTS "minute_links_inventory_item_id_idx" ON "minute_links" ("inventory_item_id");

-- ============================================
-- 6. Update comment on entity_relationships
-- ============================================
COMMENT ON TABLE "entity_relationships" IS 'Universal relationship table - coexists with legacy structures (rollback state)';

-- ============================================
-- NOTE: After rollback, you must either:
-- 1. Restore database from pre-migration backup, OR
-- 2. Run a repopulation script to fill legacy structures from entity_relationships
-- ============================================
