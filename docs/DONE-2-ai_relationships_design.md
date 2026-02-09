# AI Relationship & Data Mapping Design

## Core Philosophy
1.  **Context-Centric**: The `RelationshipContext` is the hub. Entities don't talk to each other; they talk to the Context.
2.  **Determinism First**: Deterministic mappings from Context to Entity are preferred.
3.  **AI as Enricher**: AI analyzes source data to *enrich the Context* (e.g., adding a category), which then propagates to all consumers.

---

## 1. Receipt
**Role**: Strong Provider (Priority 1). The physical proof of "what happened".

### Provides to Context
*   `date` (OCR)
*   `totalAmount` (OCR)
*   `currency` (OCR)
*   `description` (Store Name from OCR)
*   `lineItems` (OCR Items)

### AI Enrichment (Populates Context)
*   **Goal**: Fill missing semantic gaps in the Context.
*   **Prompt**: "Analyze store '{storeName}' and line items. 1) Suggest a high-level `category` (e.g. Groceries, Tools). 2) flagging line items that look like durable inventory."
*   **Updates Context**:
    *   `Context.category`
    *   `Context.lineItems[i].tags` (e.g., "inventory-candidate")

### Consumes from Context
*(Rare, typically overrides Context)*

---

## 2. Reimbursement (Purchase Request)
**Role**: Intent Provider (Priority 2). The user's declaration of "why".

### Provides to Context
*   `totalAmount` (User Input)
*   `description` (User Input)
*   `purchaserId` (User)

### AI Enrichment (Populates Context)
*   **Prompt**: "Based on description '{description}', suggest the `category`."
*   **Updates Context**:
    *   `Context.category`

### Consumes from Context (When Drafted)
*   `amount` ← `Context.totalAmount`
*   `date` ← `Context.date`
*   `description` ← `Context.description`

---

## 3. Transaction (Bank Record)
**Role**: Weak Provider (Priority 3). The mechanical proof of "payment".

### Provides to Context
*   `totalAmount`
*   `date`

### AI Enrichment
*(None typically, keeps Context basic unless enriched by Receipt)*

### Consumes from Context (When Drafted/Linked)
*   `amount` ← `Context.totalAmount`
*   `date` ← `Context.date`
*   `description` ← `Context.description`
*   `category` ← `Context.category` (Crucial: Gets category from Receipt/AI)
*   `type` ← `"expense"` (default)

---

## 4. Inventory Item
**Role**: Consumer.

### Provides to Context
*(None)*

### Consumes from Context (Draft Generation)
*   **Trigger**: Any `Context.lineItems` flagged as "inventory-candidate" (or all if unspecified).
*   **Fields**:
    *   `name` ← `Context.lineItems[i].name`
    *   `value` ← `Context.lineItems[i].totalPrice`
    *   `purchasedAt` ← `Context.date`
    *   `description` ← "From: {Context.description}"

---

## 5. Budget
**Role**: Consumer / Validator.

### Provides to Context
*(None)*

### AI Enrichment (Matching)
*   **Prompt**: "Does `Context.description` (Category: `Context.category`) match any Budget keywords: {budget_list}?"
*   **Result**: Suggests linkage to specific Budget ID.

### Consumes from Context (Linkage)
*   `amount` ← `Context.totalAmount` (Deducted from budget)

---

## 6. Minute (Meeting)
**Role**: Content Source.

### Provides to Context
*   `description` (Title)
*   `date`

### AI Enrichment
*   **Prompt**: "Analyze minutes. 1) Is there `News`? 2) Are there `FAQ` updates?"

### Consumes from Context
*(N/A)*

---

## 7. News / FAQ
**Role**: Consumer (Generated Content).

### Consumes from Context (Draft Generation)
*   **News Title** ← `Context.description`
*   **News Content** ← (AI Generated Summary of Minute)
