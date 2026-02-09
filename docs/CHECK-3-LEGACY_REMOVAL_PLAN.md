# Legacy FK and Junction Table Removal Plan (Step 7.3)

## Executive Summary

This document outlines the plan to remove legacy foreign keys, junction tables, and backward-compatibility code after all routes have been migrated to the universal `entity_relationships` system.

**Prerequisites:**
- All routes use `RelationshipPicker` instead of legacy pickers
- Migration script `admin.migrate.relationships` has been run successfully
- Dual-read and write-through patterns have been active for sufficient time to ensure data consistency

---

## 1. Legacy Structures to Remove

### 1.1 Foreign Key Columns (in existing tables)

| Table | Column | References | Migration to |
|-------|--------|------------|--------------|
| `transactions` | `purchase_id` | `purchases.id` | `entity_relationships` (transaction, reimbursement) |
| `receipts` | `purchase_id` | `purchases.id` | `entity_relationships` (receipt, reimbursement) |

### 1.2 Junction Tables (to be dropped)

| Table | Purpose | Migration to |
|-------|---------|--------------|
| `inventory_item_transactions` | Links inventory items to transactions | `entity_relationships` (inventory, transaction) |
| `budget_transactions` | Links budgets to transactions | `entity_relationships` (budget, transaction) |
| `minute_links` | Links minutes to purchases, news, inventory | `entity_relationships` (minute, *) |

### 1.3 Legacy Adapter Methods (to be removed)

From `app/db/adapters/types.ts` and implementations:

```typescript
// FK-based lookups
getTransactionByPurchaseId(purchaseId: string): Promise<Transaction | null>
getReceiptsByPurchaseId(purchaseId: string): Promise<Receipt[]>
getReceiptsForPurchase(purchaseId: string): Promise<Receipt[]>
getBudgetForTransaction(transactionId: string): Promise<BudgetLink | null>
getMinuteLinkByPurchaseId(purchaseId: string): Promise<MinuteLink | null>

// Junction table operations
linkInventoryItemToTransaction(itemId: string, transactionId: string, quantity: number): Promise<void>
linkTransactionToBudget(transactionId: string, budgetId: string, amount: string | number): Promise<void>
unlinkTransactionFromBudget(transactionId: string, budgetId: string): Promise<void>
getBudgetTransactions(budgetId: string): Promise<BudgetTransactionLink[]>
```

### 1.4 Legacy Components (to be removed)

| Component | Path | Replacement |
|-----------|------|-------------|
| `InventoryPicker` | `app/components/treasury/pickers/inventory-picker.tsx` | `RelationshipPicker` |
| `BudgetPicker` | `app/components/treasury/pickers/budget-picker.tsx` | `RelationshipPicker` |
| `ReimbursementsPicker` | `app/components/treasury/pickers/reimbursements-picker.tsx` | `RelationshipPicker` |
| `ReceiptsPicker` | `app/components/treasury/pickers/receipts-picker.tsx` | `RelationshipPicker` |
| `TransactionsPicker` | `app/components/treasury/pickers/transactions-picker.tsx` | `RelationshipPicker` |
| `MinutesPicker` | `app/components/treasury/pickers/minutes-picker.tsx` | `RelationshipPicker` |

---

## 2. Pre-Migration Checklist

Before executing this plan, verify:

- [ ] All edit routes use `RelationshipPicker`:
  - [x] `treasury.receipts.$receiptId.edit.tsx`
  - [x] `treasury.transactions.$transactionId.edit.tsx`
  - [x] `treasury.reimbursements.$purchaseId.edit.tsx`
  - [x] `treasury.budgets.$budgetId.edit.tsx`
  - [ ] `minutes.$minuteId.edit.tsx` (STILL USES OLD PICKERS - needs migration)
  - [ ] Any other routes using legacy pickers

- [ ] Migration script `admin.migrate.relationships` has been run
- [ ] All existing relationships migrated to `entity_relationships` table
- [ ] Data validation: Count of relationships match between legacy and new system
- [ ] Application tested with dual-read mode (no discrepancies found)
- [ ] Backup of database created

---

## 3. Migration Steps

### Phase 1: Remove Remaining Old Picker Usage

**File:** `app/routes/minutes.$minuteId.edit.tsx`

Replace `InventoryPicker` and `ReimbursementsPicker` with `RelationshipPicker`:

```typescript
// Remove:
import { InventoryPicker } from "~/components/treasury/pickers/inventory-picker";
import { ReimbursementsPicker } from "~/components/treasury/pickers/reimbursements-picker";

// Add:
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";
```

### Phase 2: Database Migration

**Create migration file:** `drizzle/0025_remove_legacy_relationships.sql`

```sql
-- ============================================
-- Migration: Remove Legacy FKs and Junction Tables
-- This migration removes legacy relationship structures
-- AFTER all data has been migrated to entity_relationships
-- ============================================

-- 1. Drop foreign key constraints first
ALTER TABLE "transactions" DROP CONSTRAINT IF EXISTS "transactions_purchase_id_fkey";
ALTER TABLE "receipts" DROP CONSTRAINT IF EXISTS "receipts_purchase_id_fkey";

-- 2. Drop legacy columns
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "purchase_id";
ALTER TABLE "receipts" DROP COLUMN IF EXISTS "purchase_id";

-- 3. Drop indexes on legacy columns
DROP INDEX IF EXISTS "transactions_purchase_id_idx";
DROP INDEX IF EXISTS "receipts_purchase_id_idx";

-- 4. Drop junction tables
DROP TABLE IF EXISTS "inventory_item_transactions";
DROP TABLE IF EXISTS "budget_transactions";
DROP TABLE IF EXISTS "minute_links";

-- 5. Update comments
COMMENT ON TABLE "entity_relationships" IS 'Universal relationship table - now the single source of truth for all entity relationships';
```

### Phase 3: Remove Legacy Adapter Methods

**File:** `app/db/adapters/types.ts`

Remove interface definitions:

```typescript
// REMOVE these from DatabaseAdapter interface:

// FK-based lookups
getTransactionByPurchaseId(purchaseId: string): Promise<Transaction | null>
getReceiptsByPurchaseId(purchaseId: string): Promise<Receipt[]>
getReceiptsForPurchase(purchaseId: string): Promise<Receipt[]>
getBudgetForTransaction(transactionId: string): Promise<BudgetLink | null>
getMinuteLinkByPurchaseId(purchaseId: string): Promise<MinuteLink | null>

// Junction table operations
linkInventoryItemToTransaction(itemId: string, transactionId: string, quantity: number): Promise<void>
linkTransactionToBudget(transactionId: string, budgetId: string, amount: string | number): Promise<void>
unlinkTransactionFromBudget(transactionId: string, budgetId: string): Promise<void>
getBudgetTransactions(budgetId: string): Promise<BudgetTransactionLink[]>
```

**Files:** `app/db/adapters/postgres.ts` and `app/db/adapters/neon.ts`

Remove implementations of the above methods.

### Phase 4: Update Schema Types

**File:** `app/db/schema.ts`

Remove legacy table definitions and FK columns:

```typescript
// REMOVE: Legacy FK columns from transactions table
purchaseId: uuid("purchase_id").references(() => purchases.id),

// REMOVE: Legacy FK columns from receipts table
purchaseId: uuid("purchase_id").references(() => purchases.id),

// REMOVE: Junction table definitions
export const inventoryItemTransactions = pgTable(...)
export const budgetTransactions = pgTable(...)
export const minuteLinks = pgTable(...)

// REMOVE: Associated types
export type InventoryItemTransaction = ...
export type NewInventoryItemTransaction = ...
export type BudgetTransaction = ...
export type NewBudgetTransaction = ...
export type MinuteLink = ...
export type NewMinuteLink = ...
```

### Phase 5: Remove Legacy Components

**Files to delete:**

```
app/components/treasury/pickers/inventory-picker.tsx
app/components/treasury/pickers/budget-picker.tsx
app/components/treasury/pickers/reimbursements-picker.tsx
app/components/treasury/pickers/receipts-picker.tsx
app/components/treasury/pickers/transactions-picker.tsx
app/components/treasury/pickers/minutes-picker.tsx
```

Also remove the directory if empty:
```
app/components/treasury/pickers/ (directory)
```

### Phase 6: Update Dependent Code

Search for and update any remaining references:

```bash
# Find all references to legacy structures
grep -r "purchaseId" --include="*.ts" --include="*.tsx" app/
grep -r "inventoryItemTransactions" --include="*.ts" --include="*.tsx" app/
grep -r "budgetTransactions" --include="*.ts" --include="*.tsx" app/
grep -r "minuteLinks" --include="*.ts" --include="*.tsx" app/
grep -r "InventoryPicker\|BudgetPicker\|ReimbursementsPicker\|ReceiptsPicker\|TransactionsPicker\|MinutesPicker" --include="*.tsx" app/
```

Update any remaining code that references these legacy structures.

### Phase 7: Remove Write-Through Code

**File:** `app/lib/relationships/save-relationships.server.ts`

Remove the write-through logic that was maintaining legacy FKs:

```typescript
// REMOVE: Write-through to legacy FKs
// (This code doesn't exist yet in current implementation, 
// but if step 7.2 was implemented, remove it here)
```

### Phase 8: Update Loaders

**File:** `app/lib/relationships/load-relationships.server.ts`

Remove dual-read logic (if implemented):

```typescript
// REMOVE: Legacy FK/junction fallback queries
// Currently not implemented, but if step 7.1 dual-read was added, remove it
```

---

## 4. Rollback Plan

If issues are discovered after migration:

### 4.1 Database Rollback

**Create rollback migration:** `drizzle/0025_remove_legacy_relationships_rollback.sql`

```sql
-- ============================================
-- Rollback: Restore Legacy FKs and Junction Tables
-- Use this if the migration causes issues
-- ============================================

-- 1. Restore columns (data will be NULL - needs repopulation from entity_relationships)
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "purchase_id" uuid REFERENCES "purchases"("id");
ALTER TABLE "receipts" ADD COLUMN IF NOT EXISTS "purchase_id" uuid REFERENCES "purchases"("id");

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS "transactions_purchase_id_idx" ON "transactions" ("purchase_id");
CREATE INDEX IF NOT EXISTS "receipts_purchase_id_idx" ON "receipts" ("purchase_id");

-- 3. Restore junction tables (structure only - data needs repopulation)
CREATE TABLE IF NOT EXISTS "inventory_item_transactions" (...);
CREATE TABLE IF NOT EXISTS "budget_transactions" (...);
CREATE TABLE IF NOT EXISTS "minute_links" (...);
```

### 4.2 Code Rollback

1. Revert git commit(s) containing the migration
2. Restore database from pre-migration backup
3. Re-deploy previous version

---

## 5. Testing Plan

### 5.1 Pre-Migration Testing

- [ ] Run full test suite
- [ ] Verify all RelationshipPicker instances work correctly
- [ ] Count relationships in legacy vs new system (should match)
- [ ] Test CRUD operations on all entity types

### 5.2 Post-Migration Testing

- [ ] Run full test suite
- [ ] Verify no errors in logs related to missing columns/tables
- [ ] Test relationship creation/linking/unlinking
- [ ] Verify no references to legacy structures remain

### 5.3 Data Validation Queries

```sql
-- Validate: All transactions with reimbursements have entity_relationships entries
SELECT COUNT(*) as orphaned_transactions
FROM transactions t
WHERE t.purchase_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM entity_relationships er
    WHERE (er.relation_a_type = 'transaction' AND er.relation_a_id = t.id AND er.relation_b_type = 'reimbursement')
       OR (er.relation_b_type = 'transaction' AND er.relation_b_id = t.id AND er.relation_a_type = 'reimbursement')
  );

-- Validate: All receipts with purchases have entity_relationships entries
SELECT COUNT(*) as orphaned_receipts
FROM receipts r
WHERE r.purchase_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM entity_relationships er
    WHERE (er.relation_a_type = 'receipt' AND er.relation_a_id = r.id AND er.relation_b_type = 'reimbursement')
       OR (er.relation_b_type = 'receipt' AND er.relation_b_id = r.id AND er.relation_a_type = 'reimbursement')
  );

-- Should return 0 for both queries before migration
```

---

## 6. Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Migrate remaining routes | 1-2 days | Development time |
| Phase 2: Database migration | 30 minutes | Phase 1 complete, backup taken |
| Phase 3: Remove adapter methods | 2-3 hours | Phase 2 complete |
| Phase 4: Update schema | 1 hour | Phase 3 complete |
| Phase 5: Remove components | 30 minutes | Phase 4 complete |
| Phase 6: Update dependent code | 2-4 hours | Phase 5 complete |
| Phase 7-8: Cleanup | 1-2 hours | Phase 6 complete |
| **Total** | **2-4 days** | - |

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss | Low | High | Full backup before migration, validation queries |
| Application errors | Medium | High | Thorough testing, rollback plan, gradual rollout |
| Missing relationship references | Medium | Medium | Comprehensive grep search, code review |
| Performance degradation | Low | Medium | Indexes on entity_relationships already exist |

---

## 8. Post-Migration Cleanup

After successful migration and verification:

1. **Remove migration script:** `app/routes/admin.migrate.relationships.tsx` (if no longer needed)
2. **Update documentation:** Remove references to legacy structures
3. **Archive this plan:** Move to `docs/archive/legacy-removal-plan.md`
4. **Team notification:** Inform team that legacy system is fully removed

---

## 9. Files Modified Summary

### Database
- `drizzle/0025_remove_legacy_relationships.sql` (new)
- `drizzle/0025_remove_legacy_relationships_rollback.sql` (new)

### Schema
- `app/db/schema.ts` (remove legacy tables/columns)

### Adapters
- `app/db/adapters/types.ts` (remove legacy methods)
- `app/db/adapters/postgres.ts` (remove implementations)
- `app/db/adapters/neon.ts` (remove implementations)

### Routes (if not already done)
- `app/routes/minutes.$minuteId.edit.tsx` (migrate to RelationshipPicker)

### Components (to delete)
- `app/components/treasury/pickers/*.tsx` (6 files)

### Lib (cleanup)
- `app/lib/relationships/save-relationships.server.ts` (remove write-through comments)

---

## Appendix A: Migration Verification Script

```typescript
// scripts/verify-migration.ts
import { getDatabase } from "~/db";

async function verifyMigration() {
  const db = getDatabase();
  
  // Check entity_relationships has all the data
  const relCounts = await db.getDatabase().select({ count: sql`count(*)` }).from(entityRelationships);
  console.log(`Total relationships in new system: ${relCounts[0].count}`);
  
  // Verify no orphaned entities
  // ... validation queries from section 5.3
  
  console.log("✅ Migration verified successfully");
}

verifyMigration().catch(console.error);
```

---

**Document Owner:** Development Team  
**Last Updated:** 2026-02-09  
**Status:** Draft - Pending Step 7.1 and 7.2 completion
