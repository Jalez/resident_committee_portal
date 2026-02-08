-- Rename Reservations to Budgets
-- Renames fund_reservations to fund_budgets and reservation_transactions to budget_transactions
-- Also renames related columns, indexes, and constraints

-- ============================================
-- RENAME TABLES
-- ============================================

ALTER TABLE "fund_reservations" RENAME TO "fund_budgets";
ALTER TABLE "reservation_transactions" RENAME TO "budget_transactions";

-- ============================================
-- RENAME COLUMNS
-- ============================================

ALTER TABLE "budget_transactions" RENAME COLUMN "reservation_id" TO "budget_id";

-- ============================================
-- RENAME FOREIGN KEY CONSTRAINTS
-- ============================================

-- Drop old constraints
ALTER TABLE "budget_transactions" DROP CONSTRAINT IF EXISTS "reservation_transactions_reservation_id_fund_reservations_id_fk";
ALTER TABLE "budget_transactions" DROP CONSTRAINT IF EXISTS "reservation_transactions_transaction_id_transactions_id_fk";
ALTER TABLE "fund_budgets" DROP CONSTRAINT IF EXISTS "fund_reservations_created_by_users_id_fk";

-- Add new constraints with updated names
ALTER TABLE "fund_budgets" ADD CONSTRAINT "fund_budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "budget_transactions" ADD CONSTRAINT "budget_transactions_budget_id_fund_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."fund_budgets"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "budget_transactions" ADD CONSTRAINT "budget_transactions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;

-- ============================================
-- RENAME INDEXES
-- ============================================

-- Drop old indexes
DROP INDEX IF EXISTS "idx_fund_reservations_year";
DROP INDEX IF EXISTS "idx_fund_reservations_status";
DROP INDEX IF EXISTS "idx_reservation_transactions_reservation_id";
DROP INDEX IF EXISTS "idx_reservation_transactions_transaction_id";
DROP INDEX IF EXISTS "idx_reservation_transactions_unique";

-- Create new indexes with updated names
CREATE INDEX "idx_fund_budgets_year" ON "fund_budgets"("year");
CREATE INDEX "idx_fund_budgets_status" ON "fund_budgets"("status");
CREATE INDEX "idx_budget_transactions_budget_id" ON "budget_transactions"("budget_id");
CREATE INDEX "idx_budget_transactions_transaction_id" ON "budget_transactions"("transaction_id");

-- Unique constraint: a transaction can only be linked to a budget once
CREATE UNIQUE INDEX "idx_budget_transactions_unique" ON "budget_transactions"("budget_id", "transaction_id");
