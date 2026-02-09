# Relationship Priority & Source Context Design

## 1. Core Concept: The "Source Context" Object

When creating or editing a related group of entities (e.g., a Receipt, a Transaction, and some Inventory Items), the system maintains a `RelationshipContext` object. This object acts as the **Single Source of Truth** for shared values like `totalAmount`, `date`, `description`, and `lineItems`.

Instead of each entity updating independently, they all derive their initial values from this context, which is populated based on a strict **Domination Scale**.

### The `RelationshipContext` Structure

```typescript
interface RelationshipContext {
  // Core Values (Truth)
  date: Date | null;
  totalAmount: Decimal | null;
  description: string | null;
  currency: string | null;
  category: string | null;         // e.g. "Office Supplies"
  purchaserId: string | null;      // User UUID who made the purchase

  // Line Items (for inventory/breakdown)
  lineItems: Array<{
    name: string;
    quantity: number;
    unitPrice: Decimal;
    totalPrice: Decimal;
    tags?: string[];       // e.g. "inventory-candidate", "alcohol"
    sourceItemId?: string; // ID in receiptContents
  }>;

  // Metadata about where the values came from
  valueSource: "manual" | "receipt" | "reimbursement" | "transaction";
}
```

---

## 2. Domination Scale (Priority)

When multiple sources are linked, values are determined by the highest-priority source. Lower-priority sources *conform* to higher-priority ones unless manually overridden.

### Priority Level 1: Receipt (High)
*   **Why**: Represents physical proof of purchase. Contains immutable facts (Date, Amount, Vendor, Items).
*   **Effect**:
    *   Sets `date`, `totalAmount`, `description` (Store Name).
    *   **Enforcement**: Inventory items linked to this context *must* map to specific line items on the receipt (or be explicitly marked as "extra").
    *   **Overrides**: Everything else (except manual user edits).

### Priority Level 2: Reimbursement Request (Medium)
*   **Why**: Represents the user's intent ("I want money for X"). Use this if **no receipt** exists.
*   **Effect**:
    *   Sets `totalAmount`, `description`.
    *   **Overrides**: Transaction bank data (initially), because the bank transaction might be a bulk payment or have a cryptic code. The user's request is the "logical" truth.

### Priority Level 3: Transaction (Low)
*   **Why**: A bank record. It proves *money moved*, but lacks context.
*   **Effect**:
    *   Provides `date` and `amount` if nothing else exists. Only useful as a starting shell.

### Priority Level 0: Manual Input (Ultimate)
*   **Why**: The user knows best.
*   **Effect**:
    *   If a user types a custom description or changes the date, this overrides any auto-derived value.
    *   This manual data writes back to the `RelationshipContext` and propagates.

---

## 3. Value Propagation & Overwrite Rules

### 3.1 Direct Value Mapping
When an entity is linked to a `RelationshipContext`, its relevant fields (e.g., `date`, `amount`, `description`) are *directly mapped* to the context's values. This means:
*   **Initial Population**: When an entity is first linked, it pulls its values from the context.
*   **Updates**: If the context's value changes (due to a higher-priority source or manual override), the linked entity's value *automatically updates* to reflect the context.

### 3.2 Strict Overwrite Based on Priority
*   **Higher Priority Wins**: If a new entity is linked that has a higher priority than the current `valueSource` in the `RelationshipContext`, its values will overwrite the context's values.
    *   *Example*: If `valueSource` is "transaction" and a "receipt" is linked, the receipt's `date`, `totalAmount`, `description`, and `lineItems` will overwrite the context.
*   **Lower Priority Conforms**: If a new entity is linked that has a lower priority than the current `valueSource`, its values are *ignored* for the context. Instead, the entity's values are updated to match the context.
    *   *Example*: If `valueSource` is "receipt" and a "transaction" is linked, the transaction's `date` and `amount` will be updated to match the receipt's values in the context.

### 3.3 Locked Entities
To prevent accidental changes to finalized or reconciled items, entities can be "locked".
*   **Effect**: A locked entity's values cannot be changed, even by a higher-priority `RelationshipContext`.
*   **Conflict Resolution**: If a locked entity's values conflict with a higher-priority context, the system will flag this as an inconsistency rather than forcing an overwrite. The user must manually resolve the conflict (e.g., unlock the entity, adjust the context, or acknowledge the discrepancy).
*   **Use Cases**: Useful for reconciled bank transactions, approved reimbursement requests, or archived receipts.

---

## 4. Data Flow Scenarios

### Scenario A: Receipt First (Ideal)
1.  **User uploads Receipt**.
2.  **Context Update**:
    *   `valueSource` = "receipt"
    *   `date` = Receipt.date
    *   `totalAmount` = Receipt.total
    *   `lineItems` = OCR Items
3.  **User adds Transaction**:
    *   Transaction values default to Context values.
    *   Transaction `amount` matches Receipt.
4.  **User adds Inventory**:
    *   System asks: "Which receipt line item is this?" (Constraint: Inventory comes from Receipt).
    *   Inventory item's `unitPrice` and `totalPrice` are mapped from the receipt line item.

### Scenario B: Reimbursement First (No Receipt)
1.  **User creates Reimbursement**.
2.  **Context Update**:
    *   `valueSource` = "reimbursement"
    *   `totalAmount` = User Input
    *   `description` = User Input
3.  **User adds Transaction**:
    *   Transaction finds match based on Reimbursement amount.
    *   Transaction's `amount` and `description` are mapped from the context.

### Scenario C: Transaction -> Receipt (Refining)
1.  **User starts with Transaction** (€50.00, "K-Market").
2.  **Context**: `valueSource` = "transaction".
    *   Context `date` = Transaction.date, `totalAmount` = Transaction.amount, `description` = Transaction.description.
3.  **User links Receipt** (€50.00, "K-Market Oulu", Items: [Beer, Milk]).
4.  **Context Update** (Domination):
    *   `valueSource` = "receipt" (Higher Priority)
    *   `description` updates to "K-Market Oulu" (More precise)
    *   `lineItems` populated.
    *   Transaction's `description` also updates to "K-Market Oulu" (due to direct mapping).
5.  **User overrides**: Changes description to "Groceries for Event".
    *   `valueSource` = "manual".
    *   Context `description` becomes "Groceries for Event".
    *   Transaction's `description` also becomes "Groceries for Event".

---

## 5. Mesh Linking (Cross-Connection)

When the **Source Entity** is saved, the system ensures closure of the relationship graph.

**Rule**: *If A is linked to B, and A is linked to C, then B must be linked to C (if logic permits).*

**Example: Editing a Transaction (Source)**
*   User edits **Transaction #101**.
*   User adds **Receipt #500**.
*   User adds **Reimbursement #900**.
*   User clicks **Save**.

**Backend Logic**:
1.  Verify links:
    *   Transaction #101 <-> Receipt #500
    *   Transaction #101 <-> Reimbursement #900
2.  **Auto-Create Mesh Link**:
    *   Receipt #500 <-> Reimbursement #900 (Because they share a parent Transaction context).
    *   *Result*: The Reimbursement now "has" the Receipt.

**Example: Editing a Receipt (Source)**
*   User edits **Receipt #500**.
*   User creates **Inventory Item "Drill"**.
*   User links **Transaction #101**.
*   User clicks **Save**.

**Backend Logic**:
1.  Verify links:
    *   Receipt #500 <-> Inventory "Drill"
    *   Receipt #500 <-> Transaction #101
2.  **Auto-Create Mesh Link**:
    *   Transaction #101 <-> Inventory "Drill"
    *   *Result*: The Transaction is now properly categorized (e.g. Equipment) and linked to the asset.

---

## 6. Scenario Walkthrough: The Evolution of Source Context

Here is a concrete example of how the `RelationshipContext` object (and the linked entities) changes as a user builds a reimbursement request.

### Step 1: User creates a Transaction (Imported from Bank)
*   **Action**: User imports a bank transaction.
*   **Entity**: `Transaction #101` (Date: 2024-05-01, Amount: -45.00, Desc: "K-MARKET 1234")

**Resulting Context Object**:
```json
{
  "id": "rel-ctx-uuid",
  "valueSource": "transaction",
  "date": "2024-05-01",
  "totalAmount": 45.00,
  "description": "K-MARKET 1234",
  "currency": "EUR",
  "category": "Groceries",    // Inferred from merchant code or user history
  "lineItems": [],  // Transaction has no line items
  "linkedEntityIds": ["transaction-101"]
}
```

### Step 2: User creates a Reimbursement Request
*   **Action**: User clicks "Create Reimbursement" on the transaction.
*   **Input**: User types "Snacks for May Day party".
*   **Logic**: Reimbursement (Priority 2) > Transaction (Priority 3).

**Resulting Context Object**:
```json
{
  "id": "rel-ctx-uuid",
  "valueSource": "reimbursement",  // Upgraded priority
  "date": "2024-05-01",            // Kept from transaction (reimbursement date usually same)
  "totalAmount": 45.00,            // Matches transaction
  "description": "Snacks for May Day party", // OVERWRITES transaction description in Context
  "currency": "EUR",
  "category": "Groceries",         // Inherited from Transaction
  "lineItems": [],
  "linkedEntityIds": ["transaction-101", "reimbursement-900"]
}
```
*   **Side Effect**: `Transaction #101` description is auto-updated to "Snacks for May Day party".

### Step 3: User uploads a Receipt
*   **Action**: User uploads a photo. OCR runs.
*   **Data Found**: Store "K-Market Oulu", Date "2024-05-01", Total "45.00".
*   **Line Items**: "Donuts" (5.00), "Sima" (10.00), "Paper Plates" (30.00).
*   **Logic**: Receipt (Priority 1) > Reimbursement (Priority 2).

**Resulting Context Object**:
```json
{
  "id": "rel-ctx-uuid",
  "valueSource": "receipt",        // Upgraded to highest priority
  "date": "2024-05-01",
  "totalAmount": 45.00,
  "description": "K-Market Oulu",  // OVERWRITES "Snacks..." because Receipt is Truth
  "currency": "EUR",
  "category": "Food & Drink",      // Updated by AI analysis of receipt items
  "lineItems": [
    { "name": "Donuts", "quantity": 10, "unitPrice": 0.50, "totalPrice": 5.00 },
    { "name": "Sima", "quantity": 2, "unitPrice": 5.00, "totalPrice": 10.00 },
    { "name": "Paper Plates", "quantity": 3, "unitPrice": 10.00, "totalPrice": 30.00 }
  ],
  "linkedEntityIds": ["transaction-101", "reimbursement-900", "receipt-500"]
}
```
*   **Side Effect**: `Reimbursement #900` and `Transaction #101` descriptions update to "K-Market Oulu" (unless user explicitly overrides/locks them).

### Step 4: User Links Inventory
*   **Action**: User clicks "Link Inventory".
*   **System Prompt**: "Select items from receipt to track."
*   **User Selection**: Selects "Paper Plates" (Context Item #3).

**Resulting Inventory Item**:
```json
{
  "name": "Paper Plates",
  "value": 30.00,
  "purchasedAt": "2024-05-01",
  "description": "From K-Market Oulu",
  "sourceItemId": "receipt-item-3-uuid" // Links back to specific context line item
}
```
