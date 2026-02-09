# Draft System Implementation Plan

## Overview
Implement a universal draft system allowing entities to exist in the database with partial data and be linked before completion.

## Schema Changes

### 1. Add Draft Status to All Linkable Entities

Entities that need draft support:
- `receipts`
- `transactions`
- `purchases` (reimbursements)
- `budgets`
- `inventoryItems`
- `minutes`

**Migration:**
```sql
-- Add status column to each table
ALTER TABLE receipts ADD COLUMN status VARCHAR(20) DEFAULT 'active';
ALTER TABLE transactions ADD COLUMN status VARCHAR(20) DEFAULT 'active';
ALTER TABLE purchases ADD COLUMN status VARCHAR(20) DEFAULT 'active';
ALTER TABLE budgets ADD COLUMN status VARCHAR(20) DEFAULT 'active';
ALTER TABLE inventory_items ADD COLUMN status VARCHAR(20) DEFAULT 'active';
ALTER TABLE minutes ADD COLUMN status VARCHAR(20) DEFAULT 'active';

-- Add index for filtering
CREATE INDEX idx_receipts_status ON receipts(status);
CREATE INDEX idx_transactions_status ON transactions(status);
-- ... etc
```

### 2. Update Schema Definitions

```typescript
// app/db/schema.ts
export const entityStatus = pgEnum('entity_status', ['draft', 'active', 'archived']);

export const receipts = pgTable('receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: entityStatus('status').default('draft').notNull(),

  // Optional fields when draft
  name: text('name'),  // Remove .notNull() for draft support
  pathname: text('pathname'),  // Can be null for drafts
  url: text('url'),  // Can be null for drafts

  // ... other fields
});
```

### 3. Validation Strategy

**Two-tier validation:**
1. **Draft validation** - Allow partial data
2. **Active validation** - Enforce all requirements

```typescript
// app/lib/validation/draft-validation.ts
export const receiptDraftSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  // Minimal requirements for draft
});

export const receiptActiveSchema = receiptDraftSchema.extend({
  name: z.string().min(1),
  pathname: z.string().min(1),
  url: z.string().url(),
  // All required fields
});

export function validateReceipt(data: unknown, status: 'draft' | 'active') {
  return status === 'draft'
    ? receiptDraftSchema.parse(data)
    : receiptActiveSchema.parse(data);
}
```

## Database Adapter Changes

### 1. Query Filtering

```typescript
// app/db/adapters/types.ts
export interface QueryOptions {
  includeDrafts?: boolean;
  includeArchived?: boolean;
  status?: 'draft' | 'active' | 'archived';
}

// Update all get methods
getReceipts(options?: QueryOptions): Promise<Receipt[]>;
getReceiptById(id: string, options?: QueryOptions): Promise<Receipt | null>;
```

### 2. Draft Management Methods

```typescript
// app/db/adapters/types.ts
interface DatabaseAdapter {
  // Create entity as draft
  createDraft<T>(table: string, data: Partial<T>): Promise<T>;

  // Promote draft to active
  publishDraft(table: string, id: string): Promise<void>;

  // Clean up abandoned drafts
  cleanupDrafts(olderThan: Date): Promise<number>;

  // Get all user's drafts
  getUserDrafts(userId: string): Promise<Draft[]>;
}
```

### 3. Auto-save Implementation

```typescript
// app/hooks/use-draft-persistence.ts
export function useDraftPersistence<T>(
  entityType: string,
  initialData?: Partial<T>
) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [data, setData] = useState<Partial<T>>(initialData || {});

  // Auto-save every 3 seconds
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (draftId) {
        await fetch(`/api/drafts/${draftId}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      } else {
        // Create new draft
        const response = await fetch(`/api/drafts/${entityType}`, {
          method: 'POST',
          body: JSON.stringify(data),
        });
        const { id } = await response.json();
        setDraftId(id);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [data, draftId, entityType]);

  return { draftId, data, setData };
}
```

## UI Changes

### 1. Draft Indicator

```typescript
// app/components/draft-badge.tsx
export function DraftBadge({ status }: { status: string }) {
  if (status !== 'draft') return null;

  return (
    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
      <span className="material-symbols-outlined text-sm mr-1">edit_note</span>
      Draft
    </Badge>
  );
}
```

### 2. Draft List View

```typescript
// Add to navigation or dashboard
export function DraftsList() {
  const drafts = useLoaderData<{ drafts: Draft[] }>();

  return (
    <div>
      <h2>Your Drafts</h2>
      {drafts.map(draft => (
        <DraftItem key={draft.id} draft={draft} />
      ))}
    </div>
  );
}
```

### 3. Publish/Save Split

```typescript
// On edit pages
<div className="flex gap-2">
  <Button onClick={saveDraft} variant="outline">
    Save Draft
  </Button>
  <Button onClick={publish} disabled={!isValid}>
    Publish
  </Button>
</div>
```

## Source Context with Drafts

```typescript
// app/routes/treasury.receipts.new.tsx
export default function ReceiptNew() {
  const { draftId, data, setData } = useDraftPersistence('receipt');

  // Pass draft ID as source context
  return (
    <ReimbursementsPicker
      // ... other props
      sourceEntityType="receipt"
      sourceEntityId={draftId}  // ✅ Now has ID even before "save"
      sourceEntityName={data.name || "Unsaved Receipt"}
    />
  );
}
```

## Draft Cleanup Strategy

### 1. Scheduled Cleanup Job

```typescript
// scripts/cleanup-drafts.ts
import { getDatabase } from "~/db";

async function cleanupDrafts() {
  const db = getDatabase();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const deleted = await db.cleanupDrafts(thirtyDaysAgo);
  console.log(`Deleted ${deleted} abandoned drafts`);
}

// Run via cron: 0 2 * * * (daily at 2am)
```

### 2. User-initiated Cleanup

```typescript
// app/routes/settings.drafts.tsx
export async function action({ request }: ActionArgs) {
  const formData = await request.formData();
  const draftId = formData.get('draftId');

  if (formData.get('action') === 'delete') {
    await db.deleteDraft(draftId);
    return redirect('/settings/drafts');
  }
}
```

## Migration Path

### Phase 1: Add Status Column (Non-breaking)
- Add status column with default='active'
- Existing data automatically marked as active
- No behavior changes yet

### Phase 2: Update Queries (Gradual)
- Add filtering support
- Update one entity type at a time
- Test thoroughly

### Phase 3: Enable Draft Creation
- Add draft creation UI
- Implement auto-save
- Roll out per entity type

### Phase 4: Cleanup & Optimization
- Implement draft cleanup
- Add draft management UI
- Performance optimization

## Testing Strategy

### 1. Draft Lifecycle
- [ ] Create draft with minimal data
- [ ] Auto-save updates
- [ ] Link draft to other entity
- [ ] Publish draft with full validation
- [ ] Verify no data loss

### 2. Query Filtering
- [ ] List views exclude drafts by default
- [ ] Detail pages can view drafts
- [ ] Linking works with draft entities
- [ ] Archived items excluded

### 3. Cleanup
- [ ] Old drafts deleted correctly
- [ ] Active entities not touched
- [ ] Linked drafts not orphaned

## Alternative: Client-Side Draft Linking

**Lighter weight approach:**
```typescript
// Store link intentions in context, apply on save
const [pendingLinks, setPendingLinks] = useState({
  reimbursements: ['pending-id-1'],  // Tracks intention
  transactions: []
});

// On save, create entities in order and link
async function saveAll() {
  const receipt = await createReceipt(receiptData);

  // Create reimbursements and link to receipt
  for (const reimbData of pendingReimbursements) {
    await createReimbursement({
      ...reimbData,
      receiptId: receipt.id  // Link now that receipt exists
    });
  }
}
```

**Pros:**
- No DB changes
- Simpler implementation
- Less risk

**Cons:**
- Data loss risk (no auto-save)
- Complex state management
- Can't navigate away mid-flow

## Recommendation

**If you want robust UX:** Implement full draft system (phased approach)
**If you want quick win:** Start with client-side linking + auto-save to sessionStorage

The draft system is the right long-term solution for a complex treasury application, but it's a significant undertaking.

## Effort Estimate

- **Draft System (Full):** 3-5 days
  - Schema changes: 0.5 day
  - Adapter updates: 1 day
  - Auto-save: 0.5 day
  - UI updates: 1 day
  - Testing/cleanup: 1-2 days

- **Client-side Linking:** 1-2 days
  - Context setup: 0.5 day
  - Save orchestration: 0.5 day
  - Testing: 0.5-1 day
