# Entity Relationships System

This document explains how the portal's relationship system works and how to use it.

## Overview

The portal manages several types of entities that can be linked together:
- **Receipts** - Physical proof of purchase (from OCR/upload)
- **Transactions** - Bank records
- **Reimbursements** - Purchase requests for reimbursement
- **Inventory** - Tracked items
- **Minutes** - Meeting documents

These entities can be **linked** to each other, creating a web of relationships. For example:
- A Receipt can be linked to a Transaction (same purchase)
- A Receipt can be linked to Inventory items (what was purchased)
- A Reimbursement can be linked to a Transaction (payment record)

## Key Concepts

### 1. Direct Relationships Only

Relationships are **explicit and direct**. If Entity A is linked to Entity B, and Entity B is linked to Entity C, Entity A is NOT automatically linked to Entity C.

```
Receipt ←→ Transaction ←→ Reimbursement
         (linked)           (linked)

Receipt ←/→ Reimbursement
       (NOT linked - no direct relationship)
```

This design choice provides:
- **Explicit Control** - You choose exactly what links to what
- **Clear Semantics** - No surprise interactions from transitive relationships
- **Simpler Reasoning** - The relationship graph is easy to understand

### 2. Relationship Context (Value Priority)

When entities are linked, they often share common values like amount, date, and description. The system uses a **Domination Scale** to determine which entity's values should be the "source of truth":

| Priority | Entity Type | Reason |
|----------|-------------|--------|
| 4 (Ultimate) | **Manual** | User explicitly sets values |
| 3 (High) | **Receipt** | Physical proof - immutable facts |
| 2 (Medium) | **Reimbursement** | User's intent and grouping |
| 1 (Low) | **Transaction** | Bank record - lacks context |
| 0 | Other types | No financial context contribution |

**Example**: If you link a Transaction (amount: €50) with a Receipt (amount: €48.50), the system uses the Receipt's amount because Receipts have higher priority.

### 3. URL Source Context

When creating a new entity from another entity's page, the URL carries **source context**:

```
/transactions/new?source=receipt:abc123:K-Market
```

This allows the new entity form to:
- Pre-fill values from the source entity
- Automatically create the relationship on save

## Implementation

### Backend

```typescript
// Get context values for an entity (from linked entities)
import { getRelationshipContext } from "~/lib/relationships/relationship-context.server";

const context = await getRelationshipContext(db, "transaction", "tx-123");
// Returns: { date, totalAmount, description, valueSource, ... }

// Check priority
import { getEntityPriority, shouldOverride } from "~/lib/relationships/relationship-context.server";

getEntityPriority("receipt");  // 3
shouldOverride("receipt", "transaction");  // true
```

### Frontend

```typescript
// Encode source context for URL
import { encodeRelationshipContext, getRelationshipContextFromUrl } from "~/lib/linking/relationship-context";

const encoded = encodeRelationshipContext({
  type: "receipt",
  id: "abc123",
  name: "K-Market Purchase"
});
// Result: "receipt:abc123:K-Market%20Purchase"

// Parse from URL
const source = getRelationshipContextFromUrl(request.url);
// Result: { type: "receipt", id: "abc123", name: "K-Market Purchase" }
```

### Database

Relationships are stored in the `entity_relationships` table:

```sql
CREATE TABLE entity_relationships (
  id UUID PRIMARY KEY,
  relation_a_type TEXT,  -- e.g., "receipt"
  relation_id TEXT,      -- Entity A's ID
  relation_b_type TEXT,  -- e.g., "transaction"
  relation_b_id TEXT,    -- Entity B's ID
  metadata JSONB,        -- Optional relationship metadata
  created_at TIMESTAMP
);
```

## Common Workflows

### Linking Entities

1. User views a Transaction
2. User clicks "Link Receipt"
3. User selects or uploads a Receipt
4. System creates the relationship
5. Transaction values update to match Receipt (higher priority)

### Creating New Entity from Context

1. User views a Receipt
2. User clicks "Create Transaction"
3. URL includes `?source=receipt:abc123:Store Name`
4. Form pre-fills with Receipt values
5. On save, relationship is automatically created

### Unlinking Entities

1. User views an entity with linked items
2. User clicks the X on a linked item
3. Relationship is removed
4. Context recalculates from remaining links

## Testing

Run the test suite:

```bash
bun test tests/relationship-context.test.ts
bun test tests/relationship-context-propagation.test.ts
bun test tests/relationship-context-frontend.test.ts
```

## See Also

- [DONE-2-relationship_context_design.md](./DONE-2-relationship_context_design.md) - Detailed design specification
