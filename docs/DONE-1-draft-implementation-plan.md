# Draft System Implementation Plan

## Current Status Audit

### ✅ Treasury Entities WITH Status Field

| Entity | Current Status Values | Action Needed |
|--------|----------------------|---------------|
| `purchases` (reimbursements) | `"pending" \| "approved" \| "reimbursed" \| "rejected"` | Add `"draft"` |
| `transactions` | `"pending" \| "complete" \| "paused" \| "declined"` | Add `"draft"` |
| `fundBudgets` | `"open" \| "closed"` | Add `"draft"` |
| `inventoryItems` | `"active" \| "removed" \| "legacy"` | Add `"draft"` |

### ❌ Treasury Entities WITHOUT Status Field

| Entity | Current State | Action Needed |
|--------|--------------|---------------|
| `receipts` | No status field | Add status field + type |
| `minutes` | No status field | Add status field + type |

---

## Implementation Steps

### Step 1: Update Type Definitions

**File:** `app/db/schema.ts`

```typescript
// Add draft to existing status types
export type InventoryItemStatus = "draft" | "active" | "removed" | "legacy";
export type PurchaseStatus = "draft" | "pending" | "approved" | "reimbursed" | "rejected";
export type TransactionStatus = "draft" | "pending" | "complete" | "paused" | "declined";
export type BudgetStatus = "draft" | "open" | "closed";

// Add new status types for receipts and minutes
export type ReceiptStatus = "draft" | "active" | "archived";
export type MinuteStatus = "draft" | "active" | "archived";
```

### Step 2: Add Status Fields to Receipts

**File:** `app/db/schema.ts` (around line 591)

```typescript
export const receipts = pgTable("receipts", {
	id: uuid("id").primaryKey().defaultRandom(),

	// ADD: Status field
	status: text("status").$type<ReceiptStatus>().notNull().default("draft"),

	// Receipt metadata
	name: text("name"), // Optional when draft
	description: text("description"),

	// File storage info - can be null for drafts
	url: text("url"), // Remove .notNull() to allow drafts without files
	pathname: text("pathname"), // Remove .notNull() to allow drafts

	// Link to purchase
	purchaseId: uuid("purchase_id").references(() => purchases.id),

	// Creator tracking
	createdBy: uuid("created_by").references(() => users.id),

	// Timestamps
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### Step 3: Add Status Fields to Minutes

**File:** `app/db/schema.ts` (around line 650)

```typescript
export const minutes = pgTable("minutes", {
	id: uuid("id").primaryKey().defaultRandom(),

	// ADD: Status field
	status: text("status").$type<MinuteStatus>().notNull().default("draft"),

	date: timestamp("date"), // Can be null for drafts
	title: text("title"), // Can be null for drafts
	description: text("description"),

	// File storage info - can be null for drafts
	fileUrl: text("file_url"), // Remove .notNull() to allow drafts
	fileKey: text("file_key"), // Remove .notNull() to allow drafts
	year: integer("year"), // Can be null for drafts

	// Creator tracking
	createdBy: uuid("created_by").references(() => users.id),

	// Timestamps
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### Step 4: Create Migration

**File:** `drizzle/0022_add_draft_status.sql`

```sql
-- Add status to receipts (set existing records to 'active')
ALTER TABLE receipts ADD COLUMN status VARCHAR(20) DEFAULT 'active' NOT NULL;

-- Make url and pathname nullable for drafts
ALTER TABLE receipts ALTER COLUMN url DROP NOT NULL;
ALTER TABLE receipts ALTER COLUMN pathname DROP NOT NULL;

-- Add status to minutes (set existing records to 'active')
ALTER TABLE minutes ADD COLUMN status VARCHAR(20) DEFAULT 'active' NOT NULL;

-- Make required fields nullable for drafts
ALTER TABLE minutes ALTER COLUMN date DROP NOT NULL;
ALTER TABLE minutes ALTER COLUMN title DROP NOT NULL;
ALTER TABLE minutes ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE minutes ALTER COLUMN file_key DROP NOT NULL;
ALTER TABLE minutes ALTER COLUMN year DROP NOT NULL;

-- Add indexes for filtering by status
CREATE INDEX idx_receipts_status ON receipts(status);
CREATE INDEX idx_minutes_status ON minutes(status);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_purchases_status ON purchases(status);
CREATE INDEX idx_fund_budgets_status ON fund_budgets(status);
CREATE INDEX idx_inventory_items_status ON inventory_items(status);

-- Add composite indexes for common queries (active items by user)
CREATE INDEX idx_receipts_status_created_by ON receipts(status, created_by);
CREATE INDEX idx_minutes_status_created_by ON minutes(status, created_by);
CREATE INDEX idx_transactions_status_created_by ON transactions(status, created_by);
CREATE INDEX idx_purchases_status_created_by ON purchases(status, created_by);

-- Comment
COMMENT ON COLUMN receipts.status IS 'draft: unsaved/incomplete, active: normal state, archived: soft deleted';
COMMENT ON COLUMN minutes.status IS 'draft: unsaved/incomplete, active: normal state, archived: soft deleted';
```

### Step 5: Update Database Adapters

**File:** `app/db/adapters/types.ts`

```typescript
// Add query options interface
export interface QueryOptions {
	includeDrafts?: boolean;
	includeArchived?: boolean;
	status?: string;
	createdBy?: string; // Filter by creator
}

// Update method signatures to accept options
export interface DatabaseAdapter {
	// Receipts
	getReceipts(options?: QueryOptions): Promise<Receipt[]>;
	getReceiptById(id: string, options?: QueryOptions): Promise<Receipt | null>;
	getReceiptsByYear(year: number, options?: QueryOptions): Promise<Receipt[]>;

	// Minutes
	getMinutes(options?: QueryOptions): Promise<Minute[]>;
	getMinuteById(id: string, options?: QueryOptions): Promise<Minute | null>;

	// Transactions
	getTransactionsByYear(year: number, options?: QueryOptions): Promise<Transaction[]>;
	getTransactionById(id: string, options?: QueryOptions): Promise<Transaction | null>;

	// Purchases (Reimbursements)
	getPurchases(options?: QueryOptions): Promise<Purchase[]>;
	getPurchaseById(id: string, options?: QueryOptions): Promise<Purchase | null>;

	// Budgets
	getBudgets(options?: QueryOptions): Promise<FundBudget[]>;
	getBudgetById(id: string, options?: QueryOptions): Promise<FundBudget | null>;

	// Inventory
	getInventoryItems(options?: QueryOptions): Promise<InventoryItem[]>;
	getInventoryItemById(id: string, options?: QueryOptions): Promise<InventoryItem | null>;

	// Draft management
	createDraft<T extends { status: string }>(
		table: string,
		data: Partial<T>,
		userId: string
	): Promise<T>;

	publishDraft(table: string, id: string): Promise<void>;

	getUserDrafts(userId: string): Promise<Array<{
		id: string;
		type: string;
		status: string;
		createdAt: Date;
		data: any;
	}>>;

	deleteDraft(table: string, id: string, userId: string): Promise<void>;

	cleanupOldDrafts(olderThanDays: number): Promise<number>;
}
```

**Helper function for filtering:**

```typescript
// app/db/adapters/query-helpers.ts
import { SQL, and, eq, inArray, or } from "drizzle-orm";

export function buildStatusFilter<T extends { status: any }>(
	table: T,
	options?: QueryOptions
): SQL | undefined {
	const conditions: SQL[] = [];

	// By default, exclude drafts and archived
	if (!options?.includeDrafts && !options?.status) {
		conditions.push(
			and(
				table.status !== "draft",
				table.status !== "archived"
			) as SQL
		);
	}

	// Specific status filter
	if (options?.status) {
		conditions.push(eq(table.status, options.status));
	}

	// Include archived
	if (options?.includeArchived === false) {
		conditions.push(table.status !== "archived" as SQL);
	}

	return conditions.length > 0 ? and(...conditions) : undefined;
}
```

### Step 6: Implement in Database Adapters

**File:** `app/db/adapters/neon.ts` (similar for postgres.ts)

```typescript
import { buildStatusFilter } from "./query-helpers";

class NeonAdapter implements DatabaseAdapter {
	// Example: getReceipts with status filtering
	async getReceipts(options?: QueryOptions): Promise<Receipt[]> {
		const statusFilter = buildStatusFilter(receipts, options);

		let query = this.db.select().from(receipts);

		if (statusFilter) {
			query = query.where(statusFilter);
		}

		if (options?.createdBy) {
			query = query.where(eq(receipts.createdBy, options.createdBy));
		}

		return query;
	}

	async getReceiptById(id: string, options?: QueryOptions): Promise<Receipt | null> {
		const statusFilter = buildStatusFilter(receipts, options);

		const conditions = [eq(receipts.id, id)];
		if (statusFilter) {
			conditions.push(statusFilter);
		}

		const result = await this.db
			.select()
			.from(receipts)
			.where(and(...conditions))
			.limit(1);

		return result[0] || null;
	}

	// Draft management
	async createDraft<T extends { status: string }>(
		table: string,
		data: Partial<T>,
		userId: string
	): Promise<T> {
		const draftData = {
			...data,
			status: "draft",
			createdBy: userId,
		};

		// Use the appropriate table - this is simplified
		// In reality, you'd need to map table names to actual table objects
		const result = await this.db.insert(receipts).values(draftData).returning();
		return result[0] as T;
	}

	async publishDraft(table: string, id: string): Promise<void> {
		// Validate that all required fields are present before publishing
		// Then update status to 'active'
		await this.db
			.update(receipts) // Use appropriate table
			.set({ status: "active", updatedAt: new Date() })
			.where(and(
				eq(receipts.id, id),
				eq(receipts.status, "draft")
			));
	}

	async getUserDrafts(userId: string): Promise<any[]> {
		// Query all tables for drafts by this user
		const [receiptDrafts, minuteDrafts, transactionDrafts, purchaseDrafts] = await Promise.all([
			this.db.select().from(receipts).where(
				and(eq(receipts.status, "draft"), eq(receipts.createdBy, userId))
			),
			this.db.select().from(minutes).where(
				and(eq(minutes.status, "draft"), eq(minutes.createdBy, userId))
			),
			this.db.select().from(transactions).where(
				and(eq(transactions.status, "draft"), eq(transactions.createdBy, userId))
			),
			this.db.select().from(purchases).where(
				and(eq(purchases.status, "draft"), eq(purchases.createdBy, userId))
			),
		]);

		return [
			...receiptDrafts.map(d => ({ ...d, type: "receipt" })),
			...minuteDrafts.map(d => ({ ...d, type: "minute" })),
			...transactionDrafts.map(d => ({ ...d, type: "transaction" })),
			...purchaseDrafts.map(d => ({ ...d, type: "purchase" })),
		];
	}

	async cleanupOldDrafts(olderThanDays: number): Promise<number> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

		let totalDeleted = 0;

		// Delete old drafts from each table
		const receiptsDeleted = await this.db
			.delete(receipts)
			.where(and(
				eq(receipts.status, "draft"),
				receipts.createdAt < cutoffDate
			));

		// Repeat for other tables...

		return totalDeleted;
	}
}
```

### Step 7: Update Routes to Use Status Filtering

**Example:** `app/routes/treasury.receipts.tsx`

```typescript
export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const year = url.searchParams.get("year");

	// Get receipts, excluding drafts by default
	const receipts = await db.getReceipts({
		includeDrafts: false,  // Don't show drafts in main list
		includeArchived: false, // Don't show archived
	});

	// ... rest of loader
}
```

**Example:** `app/routes/treasury.receipts.new.tsx`

```typescript
export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const saveAsDraft = formData.get("saveAsDraft") === "true";

	const receiptData = {
		name: formData.get("name"),
		description: formData.get("description"),
		url: formData.get("url"),
		pathname: formData.get("pathname"),
		status: saveAsDraft ? "draft" : "active",
		// ... other fields
	};

	const receipt = await db.createReceipt(receiptData);

	if (saveAsDraft) {
		return redirect(`/treasury/receipts/${receipt.id}/edit?draft=true`);
	}

	return redirect(`/treasury/receipts?year=${year}&success=receipt_created`);
}
```

### Step 8: Create Draft Auto-Save Hook

**File:** `app/hooks/use-auto-save-draft.ts`

```typescript
import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

export function useAutoSaveDraft<T extends Record<string, any>>({
	entityType,
	entityId,
	data,
	interval = 5000, // Auto-save every 5 seconds
	enabled = true,
}: {
	entityType: string;
	entityId: string | null;
	data: T;
	interval?: number;
	enabled?: boolean;
}) {
	const fetcher = useFetcher();
	const lastSavedRef = useRef<string>("");
	const timerRef = useRef<NodeJS.Timeout>();

	useEffect(() => {
		if (!enabled) return;

		// Clear existing timer
		if (timerRef.current) {
			clearTimeout(timerRef.current);
		}

		// Set new timer
		timerRef.current = setTimeout(() => {
			const dataStr = JSON.stringify(data);

			// Only save if data has changed
			if (dataStr !== lastSavedRef.current) {
				const formData = new FormData();
				formData.append("_action", "saveDraft");
				formData.append("entityType", entityType);
				if (entityId) formData.append("entityId", entityId);
				formData.append("data", dataStr);

				fetcher.submit(formData, { method: "post" });
				lastSavedRef.current = dataStr;
			}
		}, interval);

		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, [data, entityId, entityType, interval, enabled, fetcher]);

	return {
		isSaving: fetcher.state !== "idle",
		lastSaved: lastSavedRef.current ? new Date() : null,
	};
}
```

### Step 9: Update UI Components

**Add Draft Badge:**

```typescript
// app/components/treasury/draft-badge.tsx
export function DraftBadge({ status }: { status: string }) {
	if (status !== "draft") return null;

	return (
		<div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm font-medium dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400">
			<span className="material-symbols-outlined text-base">edit_note</span>
			<span>Draft</span>
		</div>
	);
}
```

**Update Form Actions:**

```typescript
// app/components/treasury/treasury-form-actions.tsx
export function TreasuryFormActions({
	// ... existing props
	allowDraft = false,
	isDraft = false,
}: TreasuryFormActionsProps) {
	return (
		<div className="flex gap-2">
			{allowDraft && (
				<Button
					type="submit"
					variant="outline"
					name="saveAsDraft"
					value="true"
				>
					<span className="material-symbols-outlined mr-2">save</span>
					Save Draft
				</Button>
			)}
			<Button type="submit" variant="default">
				<span className="material-symbols-outlined mr-2">
					{isDraft ? "publish" : "save"}
				</span>
				{isDraft ? "Publish" : "Save"}
			</Button>
		</div>
	);
}
```

---

## Rollout Strategy

### Phase 1: Schema & Migration (Day 1)
1. ✅ Update type definitions
2. ✅ Add status fields to receipts and minutes
3. ✅ Create and run migration
4. ✅ Update database adapters with filtering

### Phase 2: Basic Draft Support (Day 2)
1. ✅ Update all routes to filter by status
2. ✅ Add "Save Draft" buttons to forms
3. ✅ Implement draft creation/publishing
4. ✅ Test basic draft workflows

### Phase 3: Auto-Save (Day 3)
1. ✅ Implement auto-save hook
2. ✅ Add to all "new" and "edit" pages
3. ✅ Add visual feedback (saving indicator)
4. ✅ Test data persistence

### Phase 4: Draft Management (Day 4)
1. ✅ Create "My Drafts" page
2. ✅ Implement draft cleanup cron job
3. ✅ Add draft restoration on page load
4. ✅ Test edge cases

### Phase 5: Source Context Integration (Day 5)
1. ✅ Update source context to work with draft IDs
2. ✅ Test cross-entity linking with drafts
3. ✅ Update documentation
4. ✅ Final QA and deployment

---

## Testing Checklist

### Draft Lifecycle
- [ ] Create new entity as draft
- [ ] Auto-save updates draft
- [ ] Publish draft → becomes active
- [ ] Draft appears in "My Drafts"
- [ ] Draft can be deleted

### Filtering
- [ ] List views exclude drafts by default
- [ ] List views exclude archived by default
- [ ] Can view drafts in "My Drafts"
- [ ] Detail pages can view draft entities
- [ ] Queries with `includeDrafts: true` work

### Linking
- [ ] Can link draft to active entity
- [ ] Can link active to draft entity
- [ ] Can link draft to draft entity
- [ ] Links persist after publishing

### Cleanup
- [ ] Old drafts deleted by cron
- [ ] Active entities never deleted
- [ ] User can manually delete their drafts

### Edge Cases
- [ ] Abandoned draft (user closes browser)
- [ ] Multiple tabs editing same draft
- [ ] Network error during auto-save
- [ ] Publishing with missing required fields

---

## Benefits Summary

✅ **Seamless UX** - No more losing data or re-entering information
✅ **Cross-entity linking** - Link drafts together before completion
✅ **Auto-save** - Never lose work again
✅ **Source context works** - Draft IDs enable auto-linking from day one
✅ **Minimal breaking changes** - Existing records become "active" automatically
✅ **Type-safe** - Full TypeScript support throughout

## Estimated Effort

**Total: 4-5 days**
- Schema changes: 0.5 day
- Database adapter updates: 1 day
- Route updates: 1 day
- UI components: 0.5 day
- Auto-save implementation: 0.5 day
- Testing: 1 day
- Documentation: 0.5 day
