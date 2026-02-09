-- ============================================
-- Migration: Remove Legacy FKs and Junction Tables
-- This migration removes legacy relationship structures
-- AFTER all data has been migrated to entity_relationships
-- 
-- Prerequisites:
-- - All routes migrated to RelationshipPicker
-- - Migration script admin.migrate.relationships has been run
-- - Data validation confirms all relationships migrated
-- - Database backup created
-- ============================================

-- 1. Drop foreign key constraints first (if they exist)
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_purchase_id_fkey";
ALTER TABLE "receipts" DROP CONSTRAINT IF EXISTS "receipts_purchase_id_fkey";

-- 2. Drop legacy columns from transactions table
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "purchase_id";

-- 3. Drop legacy columns from receipts table
ALTER TABLE "receipts" DROP COLUMN IF EXISTS "purchase_id";

-- 4. Drop indexes on legacy columns
DROP INDEX IF EXISTS "transactions_purchase_id_idx";
DROP INDEX IF EXISTS "receipts_purchase_id_idx";

-- 5. Drop inventory_item_transactions junction table
DROP TABLE IF EXISTS "inventory_item_transactions";

-- 6. Drop budget_transactions junction table
DROP TABLE IF EXISTS "budget_transactions";

-- 7. Drop minute_links junction table
DROP TABLE IF EXISTS "minute_links";

-- 8. Update comments on entity_relationships to reflect it's now the single source of truth
COMMENT ON TABLE "entity_relationships" IS 'Universal relationship table - single source of truth for all entity relationships after migration 0025';

-- ============================================
-- Verification: Run these queries to confirm migration success
-- ============================================

-- Verify legacy columns are removed
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'purchase_id'; -- Should return 0 rows
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'purchase_id'; -- Should return 0 rows

-- Verify junction tables are removed
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('inventory_item_transactions', 'budget_transactions', 'minute_links'); -- Should return 0 rows
