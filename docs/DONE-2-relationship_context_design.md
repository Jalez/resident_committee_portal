# Relationship Priority & Source Context Design

## 1. Core Concept: The "Source Context" Object

When creating or editing a related group of entities (e.g., a Receipt, a Transaction, and some Inventory Items), the system maintains a `RelationshipContext` object. This object acts as the **Single Source of Truth** for shared values like `totalAmount`, `date`, `description`, and `lineItems`.

Instead of each entity updating independently, they all derive their initial values from this context, which is populated based on a strict **Domination Scale**.

### The `RelationshipContext` Structure

```typescript
interface RelationshipContextValues {
  date: Date | null;
  totalAmount: number | null;
  description: string | null;
  currency: string | null;
  category: string | null;
  purchaserId: string | null;
  lineItems: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    tags?: string[];
    sourceItemId?: string;
  }>;
  valueSource: "manual" | "receipt" | "reimbursement" | "transaction" | null;
}
```

---

## 2. Domination Scale (Priority)

When multiple sources are linked, values are determined by the highest-priority source. Lower-priority sources *conform* to higher-priority ones unless manually overridden.

| Priority | Entity Type | Reason |
|----------|-------------|--------|
| 4 (Ultimate) | Manual | User knows best |
| 3 (High) | Receipt | Physical proof with immutable facts |
| 2 (Medium) | Reimbursement | User's intent and logical grouping |
| 1 (Low) | Transaction | Bank record, lacks context |
| 0 | Other types | No financial context |

---

## 3. Implementation

### 3.1 Core Module Location
- **Backend**: `app/lib/relationships/relationship-context.server.ts`
- **Frontend URL utilities**: `app/lib/linking/relationship-context.ts`

### 3.2 Key Functions

```typescript
// Get context values for an entity
getRelationshipContext(db, entityType, entityId, manualOverrides?)

// Utility functions
getEntityPriority(entityType)  // Returns priority level (0-4)
shouldOverride(sourceType, targetType)  // Returns true if source has higher priority
```

### 3.3 Direct Links Only

**IMPORTANT**: The RelationshipContext only considers **directly linked** entities. Indirect relationships through other entities are NOT considered.

This provides:
- **Explicit Control**: Only entities you directly link affect the context
- **Clearer Semantics**: No surprise interactions from transitive relationships
- **Simpler Reasoning**: The context is always derived from explicit links

---

## 4. Value Propagation Rules

### 4.1 Direct Value Mapping
When an entity is linked to a `RelationshipContext`, its relevant fields are *directly mapped* to the context's values:
- **Initial Population**: When an entity is first linked, it pulls values from the context
- **Updates**: If context changes (higher-priority source or manual override), linked entities update automatically

### 4.2 Strict Overwrite Based on Priority
- **Higher Priority Wins**: If a new entity with higher priority is linked, its values overwrite the context
- **Lower Priority Conforms**: If a new entity with lower priority is linked, its values are ignored; the entity's values update to match the context

### 4.3 Locked Entities
Entities can be "locked" to prevent accidental changes to finalized items. Locked entities cannot be changed even by higher-priority context.

---

## 5. Data Flow Scenarios

### Scenario A: Receipt First (Ideal)
1. **User uploads Receipt** → Context: `valueSource = "receipt"`
2. **User adds Transaction** → Transaction values default to Context values
3. **User adds Inventory** → System asks: "Which receipt line item is this?"

### Scenario B: Reimbursement First (No Receipt)
1. **User creates Reimbursement** → Context: `valueSource = "reimbursement"`
2. **User adds Transaction** → Transaction finds match based on Reimbursement amount

### Scenario C: Transaction → Receipt (Refining)
1. **User starts with Transaction** → Context: `valueSource = "transaction"`
2. **User links Receipt** → Context upgrades to `valueSource = "receipt"`, description becomes more precise

---

## 6. Entity Value Mapping

### Receipt → Context
- `date` ← `receiptContent.purchaseDate`
- `totalAmount` ← `receiptContent.totalAmount`
- `description` ← `receiptContent.storeName`
- `lineItems` ← Parsed from `receiptContent.items`

### Reimbursement → Context
- `date` ← `purchase.createdAt`
- `totalAmount` ← `purchase.amount`
- `description` ← `purchase.description`
- `purchaserId` ← `purchase.createdBy`

### Transaction → Context
- `date` ← `transaction.date`
- `totalAmount` ← `transaction.amount`
- `description` ← `transaction.description`
- `category` ← `transaction.category`

---

## 7. Tests

See:
- `tests/relationship-context.test.ts` - Core logic tests (38 tests)
- `tests/relationship-context-propagation.test.ts` - Value propagation tests (10 tests)
- `tests/relationship-context-frontend.test.ts` - Frontend URL tests (33 tests)
