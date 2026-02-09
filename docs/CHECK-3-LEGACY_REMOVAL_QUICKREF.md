# Legacy Removal Quick Reference

## What This Is

This guide helps you remove legacy FK columns and junction tables after migrating to the universal `entity_relationships` system.

## Current Status

### ✅ Completed
- Universal `entity_relationships` table exists
- `RelationshipPicker` component ready
- **All routes migrated to new picker**
- **Legacy adapter methods removed**
- **Legacy schema definitions removed**
- **Legacy picker components deleted**

### ⏳ Database Migration Pending
- Run `drizzle/0025_remove_legacy_relationships.sql` when ready to drop legacy columns/tables

### 📊 Legacy Structures to Remove

| Structure | Type | Replacement |
|-----------|------|-------------|
| `transactions.purchase_id` | FK column | `entity_relationships` |
| `receipts.purchase_id` | FK column | `entity_relationships` |
| `inventory_item_transactions` | Junction table | `entity_relationships` |
| `budget_transactions` | Junction table | `entity_relationships` |
| `minute_links` | Junction table | `entity_relationships` |

## Pre-Flight Checklist

Before running migration:

```bash
# 1. Verify all routes use RelationshipPicker
grep -r "InventoryPicker\|BudgetPicker\|ReimbursementsPicker\|ReceiptsPicker\|TransactionsPicker\|MinutesPicker" \
  app/routes --include="*.tsx"
# Should return nothing (except maybe comments)

# 2. Run verification script
bun run scripts/verify-legacy-migration.ts
# Should show all green ✅

# 3. Create database backup
# (Use your preferred backup method)
```

## Migration Steps (in order)

### Step 1: Migrate Remaining Routes

Update `app/routes/minutes.$minuteId.edit.tsx`:

```typescript
// Remove old imports
import { InventoryPicker } from "~/components/treasury/pickers/inventory-picker";
import { ReimbursementsPicker } from "~/components/treasury/pickers/reimbursements-picker";

// Add new imports
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";
```

### Step 2: Run Database Migration

```bash
# Apply migration
drizzle-kit migrate --config drizzle.config.ts

# Or manually:
psql $DATABASE_URL -f drizzle/0025_remove_legacy_relationships.sql
```

### Step 3: Remove Legacy Code

Delete these files:
```
app/components/treasury/pickers/inventory-picker.tsx
app/components/treasury/pickers/budget-picker.tsx
app/components/treasury/pickers/reimbursements-picker.tsx
app/components/treasury/pickers/receipts-picker.tsx
app/components/treasury/pickers/transactions-picker.tsx
app/components/treasury/pickers/minutes-picker.tsx
```

Remove methods from `app/db/adapters/types.ts`:
- `getTransactionByPurchaseId`
- `getReceiptsByPurchaseId`
- `getReceiptsForPurchase`
- `getBudgetForTransaction`
- `getMinuteLinkByPurchaseId`
- `linkInventoryItemToTransaction`
- `linkTransactionToBudget`
- `unlinkTransactionFromBudget`
- `getBudgetTransactions`

Remove implementations from:
- `app/db/adapters/postgres.ts`
- `app/db/adapters/neon.ts`

### Step 4: Update Schema

Remove from `app/db/schema.ts`:
- `purchaseId` column from `transactions` table
- `purchaseId` column from `receipts` table
- `inventoryItemTransactions` table definition
- `budgetTransactions` table definition
- `minuteLinks` table definition

### Step 5: Verify

```bash
# Type check
bun run typecheck

# Build
bun run build

# Test
bun test
```

## Rollback

If something goes wrong:

```bash
# Restore database
psql $DATABASE_URL -f drizzle/0025_remove_legacy_relationships_rollback.sql

# Restore code
git revert <migration-commit>
```

## Troubleshooting

### "Cannot find column purchase_id"

You have code still referencing the legacy column. Find and update it:

```bash
grep -r "purchaseId" app/ --include="*.ts" --include="*.tsx"
```

### "Table does not exist"

Some code still references the old junction tables. Find and update it:

```bash
grep -r "inventoryItemTransactions\|budgetTransactions\|minuteLinks" \
  app/ --include="*.ts" --include="*.tsx"
```

### Missing relationships after migration

The verification script should catch this. If not, run the migration script:

```bash
# Navigate to admin panel → Migrate Relationships
# Or run programmatically
```

## Timeline Estimate

| Task | Time |
|------|------|
| Migrate minutes route | 2-3 hours |
| Database migration | 30 min |
| Remove legacy code | 3-4 hours |
| Testing | 2 hours |
| **Total** | **1-2 days** |

## Contact

Questions? See the full plan in `docs/LEGACY_REMOVAL_PLAN.md`
