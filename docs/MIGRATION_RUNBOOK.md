# Database Migration Runbook

This document contains step-by-step instructions for running database migrations in production.

**Last Updated:** 2026-02-09  
**Applies to:** Migration from legacy FK/junction tables to universal `entity_relationships` table

---

## Pre-Migration Checklist

Before running any migrations:

- [ ] **Backup the database** - Full dump using your preferred method
- [ ] **Verify all routes use RelationshipPicker** - Run: `grep -r "InventoryPicker\|BudgetPicker\|ReimbursementsPicker" app/routes --include="*.tsx"`
- [ ] **Type check passes** - Run: `bun run typecheck`
- [ ] **Build succeeds** - Run: `bun run build`
- [ ] **Staging environment tested** - Verify migrations work in staging first

---

## Migration Overview

| Migration | File | Purpose | Status |
|-----------|------|---------|--------|
| 0022 | `drizzle/0022_add_draft_status.sql` | Add draft status columns | ⚠️ Run if not yet applied |
| 0023 | `drizzle/0023_nice_the_executioner.sql` | Schema adjustments | ⚠️ Run if not yet applied |
| 0024 | `drizzle/0024_add_entity_relationships.sql` | Create universal relationships table | ⚠️ Run if not yet applied |
| 0025 | `drizzle/0025_remove_legacy_relationships.sql` | **Remove legacy FKs and junction tables** | 🔴 **CRITICAL - Run after code deployed** |

---

## Step 1: Pre-Deployment Migrations (Run First)

These migrations are safe to run before the code deployment:

```bash
# Connect to your PostgreSQL database
export DATABASE_URL="postgresql://user:password@host:port/database"

# Run migrations 0022, 0023, 0024 if not yet applied
psql $DATABASE_URL -f drizzle/0022_add_draft_status.sql
psql $DATABASE_URL -f drizzle/0023_nice_the_executioner.sql
psql $DATABASE_URL -f drizzle/0024_add_entity_relationships.sql
```

**What these do:**
- Add `status` columns to entities (draft/active/archived)
- Create the `entity_relationships` table
- Add indexes for performance

**Rollback if needed:**
```bash
# These migrations have IF EXISTS checks, safe to re-run
# To rollback 0024 specifically, you'd need to manually drop the table:
# DROP TABLE entity_relationships CASCADE;
```

---

## Step 2: Migrate Legacy Data (Run Before Code Deploy)

**IMPORTANT:** Run this AFTER migrations 0022-0024 are applied but BEFORE deploying the new code.

### Option A: Using the Admin UI (Recommended)

1. Deploy migrations 0022-0024
2. Visit `/admin/migrate/relationships` in your admin panel
3. Click "Run Migration" to migrate legacy data to `entity_relationships`
4. Verify the counts match

### Option B: Manual SQL Migration

```bash
# Run the data migration SQL
psql $DATABASE_URL << 'EOF'
-- Migrate transactions.purchase_id to entity_relationships
INSERT INTO entity_relationships (id, relation_a_type, relation_a_id, relation_b_type, relation_b_id, created_by, created_at)
SELECT 
    gen_random_uuid(),
    'transaction',
    t.id,
    'reimbursement',
    t.purchase_id,
    NULL,
    NOW()
FROM transactions t
WHERE t.purchase_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM entity_relationships er
    WHERE er.relation_a_type = 'transaction' 
      AND er.relation_a_id = t.id 
      AND er.relation_b_type = 'reimbursement'
  );

-- Migrate receipts.purchase_id to entity_relationships
INSERT INTO entity_relationships (id, relation_a_type, relation_a_id, relation_b_type, relation_b_id, created_by, created_at)
SELECT 
    gen_random_uuid(),
    'receipt',
    r.id,
    'reimbursement',
    r.purchase_id,
    NULL,
    NOW()
FROM receipts r
WHERE r.purchase_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM entity_relationships er
    WHERE er.relation_a_type = 'receipt' 
      AND er.relation_a_id = r.id 
      AND er.relation_b_type = 'reimbursement'
  );

-- Verify counts
SELECT 'Migrated transactions' as check_name, COUNT(*) as count
FROM entity_relationships WHERE relation_a_type = 'transaction' AND relation_b_type = 'reimbursement'
UNION ALL
SELECT 'Migrated receipts', COUNT(*)
FROM entity_relationships WHERE relation_a_type = 'receipt' AND relation_b_type = 'reimbursement';
EOF
```

---

## Step 3: Deploy Application Code

Deploy the application code that uses the new `entity_relationships` table.

**Verify after deploy:**
- [ ] Application starts without errors
- [ ] Routes load correctly
- [ ] RelationshipPicker components render
- [ ] Creating/editing relationships works

---

## Step 4: Post-Deployment Migration (CRITICAL)

**Only run this after:**
1. ✅ Migrations 0022-0024 are applied
2. ✅ Legacy data is migrated to `entity_relationships`
3. ✅ New code is deployed and verified working
4. ✅ Database backup exists

### Run Migration 0025

```bash
# ⚠️ THIS IS DESTRUCTIVE - REMOVES LEGACY COLUMNS AND TABLES
psql $DATABASE_URL -f drizzle/0025_remove_legacy_relationships.sql
```

**What this does:**
1. Drops FK constraints on `transactions.purchase_id` and `receipts.purchase_id`
2. Removes `purchase_id` columns from `transactions` and `receipts`
3. Drops indexes on legacy columns
4. Drops junction tables:
   - `inventory_item_transactions`
   - `budget_transactions`
   - `minute_links`

---

## Verification

After migration 0025, verify:

```bash
psql $DATABASE_URL << 'EOF'
-- Check legacy columns are gone
SELECT 'transactions.purchase_id exists' as check_name, 
       COUNT(*) as result 
FROM information_schema.columns 
WHERE table_name = 'transactions' AND column_name = 'purchase_id'
UNION ALL
SELECT 'receipts.purchase_id exists', 
       COUNT(*) 
FROM information_schema.columns 
WHERE table_name = 'receipts' AND column_name = 'purchase_id'
UNION ALL
SELECT 'inventory_item_transactions exists', 
       COUNT(*) 
FROM information_schema.tables 
WHERE table_name = 'inventory_item_transactions'
UNION ALL
SELECT 'budget_transactions exists', 
       COUNT(*) 
FROM information_schema.tables 
WHERE table_name = 'budget_transactions'
UNION ALL
SELECT 'minute_links exists', 
       COUNT(*) 
FROM information_schema.tables 
WHERE table_name = 'minute_links'
UNION ALL
-- Check entity_relationships has data
SELECT 'entity_relationships count', 
       COUNT(*)::int 
FROM entity_relationships;
EOF
```

**Expected results:**
| check_name | result |
|------------|--------|
| transactions.purchase_id exists | 0 |
| receipts.purchase_id exists | 0 |
| inventory_item_transactions exists | 0 |
| budget_transactions exists | 0 |
| minute_links exists | 0 |
| entity_relationships count | <your count> |

---

## Rollback Plan

### If Migration 0025 Fails

**DO NOT PANIC.** The migration uses `IF EXISTS` clauses and should be safe to re-run.

1. **Stop the deployment**
2. **Restore database from backup** if needed
3. **Or run the rollback script:**

```bash
psql $DATABASE_URL -f drizzle/0025_remove_legacy_relationships_rollback.sql
```

**Note:** The rollback script only restores the **structure** (columns and tables). Data will need to be:
- Restored from your pre-migration backup, OR
- Repopulated from `entity_relationships` (would require a custom script)

### If Application Issues After 0025

1. **Immediate fix:**
   ```bash
   # Restore from backup (fastest recovery)
   pg_restore --clean --if-exists -d $DATABASE_URL your-backup-file.dump
   ```

2. **Alternative (if backup not available):**
   - Run rollback SQL to restore columns/tables
   - Deploy previous code version that uses legacy structures
   - Manually sync data from `entity_relationships` back to legacy structures

---

## Quick Reference

### Check Migration Status
```bash
# List applied migrations
psql $DATABASE_URL -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at;"
```

### Emergency Contacts
- **Database Admin:** <your-contact>
- **On-call Engineer:** <your-contact>
- **Rollback Runbook:** This document

---

## Post-Migration Cleanup

After successful migration and verification (1-2 weeks later):

1. Remove migration routes from admin panel
2. Archive this runbook
3. Update documentation to remove references to legacy structures
4. Celebrate! 🎉

---

## Troubleshooting

### "Cannot find column purchase_id"
```bash
# Check if migration 0025 was already run
psql $DATABASE_URL -c "\d transactions" | grep purchase_id
# Should return nothing if 0025 was applied
```

### "Table does not exist" errors
```bash
# Check which junction tables still exist
psql $DATABASE_URL -c "\dt" | grep -E "(inventory_item_transactions|budget_transactions|minute_links)"
```

### Missing relationships after migration
```bash
# Check entity_relationships has all the data
psql $DATABASE_URL -c "SELECT relation_a_type, relation_b_type, COUNT(*) FROM entity_relationships GROUP BY 1, 2;"
```

---

**Document Owner:** Development Team  
**Review Date:** After migration completion
