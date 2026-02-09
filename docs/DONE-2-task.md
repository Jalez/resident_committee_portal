Universal RelationshipPicker & AI-Powered Draft System                                                        

 Context

 Problem: The current system has 6 separate picker components (ReceiptsPicker, TransactionsPicker, ReimbursementsPicker, InventoryPicker, BudgetPicker, MinutesPicker) with similar
 patterns but entity-specific logic. Key issues:

 1. Missing direct relationships - Receipt↔Transaction and Receipt↔Inventory require going through Purchase (indirect)
 2. Redundant code - 6 pickers each re-implement add/link/remove with entity-specific wiring
 3. No AI-powered draft creation - Users must manually create and link related entities one by one
 4. No draft cleanup - Orphaned draft entities (and their files) accumulate without cleanup
 5. Limited entity support - News/FAQ can't be linked from most contexts

 Solution: A universal entity_relationships table, a unified RelationshipPicker component, and an AI-powered relationship analyzer that creates draft entities.

 ---
 Phase 1: Schema — entity_relationships Table

 1.1 Migration

 New file: drizzle/XXXX_entity_relationships.sql

 CREATE TABLE entity_relationships (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
   relation_a_type TEXT NOT NULL,
   relation_a_id UUID NOT NULL,
   relation_b_type TEXT NOT NULL,
   relation_b_id UUID NOT NULL,
   metadata TEXT,                    -- JSON: { amount?, quantity?, ai_created?, confidence? }
   created_by UUID REFERENCES users(id),
   created_at TIMESTAMP DEFAULT NOW() NOT NULL
 );
 CREATE UNIQUE INDEX entity_rel_pair_idx ON entity_relationships(relation_a_type, relation_a_id, relation_b_type, relation_b_id);
 CREATE INDEX entity_rel_relation_a_idx ON entity_relationships(relation_a_type, relation_a_id);
 CREATE INDEX entity_rel_relation_b_idx ON entity_relationships(relation_b_type, relation_b_id);

 1.2 Schema Definition

 File: app/db/schema.ts — add:

 export type RelationshipEntityType =
   | "receipt" | "transaction" | "reimbursement" | "budget"
   | "inventory" | "minute" | "news" | "faq";

 export const entityRelationships = pgTable("entity_relationships", {
   id: uuid("id").primaryKey().defaultRandom(),
   relationAType: text("relation_a_type").$type<RelationshipEntityType>().notNull(),
   relationId: uuid("relation_a_id").notNull(),
   relationBType: text("relation_b_type").$type<RelationshipEntityType>().notNull(),
   relationBId: uuid("relation_b_id").notNull(),
   metadata: text("metadata"),
   createdBy: uuid("created_by").references(() => users.id),
   createdAt: timestamp("created_at").defaultNow().notNull(),
 }, (t) => ({
   pairUnique: unique().on(t.relationAType, t.relationId, t.relationBType, t.relationBId),
   relationIdx: index("entity_rel_relation_a_idx").on(t.relationAType, t.relationId),
   relationBIdx: index("entity_rel_relation_b_idx").on(t.relationBType, t.relationBId),
 }));

 1.3 Adapter Methods

 File: app/db/adapters/types.ts — add to DatabaseAdapter interface:

 createEntityRelationship(rel: NewEntityRelationship): Promise<EntityRelationship>;
 deleteEntityRelationship(id: string): Promise<boolean>;
 deleteEntityRelationshipByPair(typeA, idA, typeB, idB): Promise<boolean>;
 getEntityRelationships(entityType, entityId, filterrelationBType?): Promise<EntityRelationship[]>;
 entityRelationshipExists(typeA, idA, typeB, idB): Promise<boolean>;
 getOrphanedDrafts(entityType, olderThan: Date): Promise<{ id: string; url?: string; pathname?: string }[]>;
 bulkDeleteDraftEntities(entityType, ids: string[]): Promise<number>;

 Implement in both postgres.ts and neon.ts. The getEntityRelationships query searches both directions (entity can be relationA OR relationB).

 1.4 Data Migration Script

 New file: scripts/migrate-relationships.ts

 Copies existing FK/junction relationships into entity_relationships:
 - receipts.purchaseId → (receipt, reimbursement)
 - transactions.purchaseId → (transaction, reimbursement)
 - purchases.inventoryItemId → (reimbursement, inventory)
 - inventoryItemTransactions rows → (inventory, transaction) with metadata { quantity }
 - budgetTransactions rows → (budget, transaction) with metadata { amount }
 - minuteLinks rows → (minute, purchase/news/faq/inventory)

 Existing FKs/junction tables are kept during migration (see Phase 7).

 ---
 Phase 2: Entity Type Registry [DONE]

 2.1 Central Configuration

 File: app/lib/entity-registry.ts

 Single source of truth for all entity type metadata:

 export interface EntityTypeConfig {
   type: RelationshipEntityType;
   labelKey: string;          // i18n key for display
   pluralKey: string;         // i18n key for plural
   icon: string;              // Material symbol name
   detailUrl: (id: string) => string;
   editUrl: (id: string) => string;  // Changed from createUrl to support draft-first workflow
   statusVariants: Record<string, string>;  // Status → Tailwind classes
   supportsUpload: boolean;   // File upload (receipts, minutes)
   supportsAIDraft: boolean;  // AI can create drafts of this type
   supportsDraft: boolean;    // Has draft status
 }

 export const ENTITY_REGISTRY: Record<RelationshipEntityType, EntityTypeConfig> = {
   receipt: { icon: "receipt_long", editUrl: (id) => `/treasury/receipts/${id}/edit`, supportsUpload: true, ... },
   transaction: { icon: "paid", editUrl: (id) => `/treasury/transactions/${id}/edit`, ... },
   reimbursement: { icon: "request_quote", editUrl: (id) => `/treasury/reimbursements/${id}/edit`, ... },
   budget: { icon: "savings", editUrl: (id) => `/treasury/budgets/${id}/edit`, ... },
   inventory: { icon: "inventory_2", editUrl: (id) => `/inventory/${id}/edit`, ... },
   minute: { icon: "description", editUrl: (id) => `/minutes/${id}/edit`, supportsUpload: true, ... },
   news: { icon: "newspaper", editUrl: (id) => `/news/${id}/edit`, supportsAIDraft: false, ... },
   faq: { icon: "help", editUrl: (id) => `/faq/${id}/edit`, supportsAIDraft: false, ... },
 };

 2.2 Entity Converter Utilities

 File: app/lib/entity-converters.ts

 Centralizes conversion logic from all 6 pickers into one file:

 export function entityToRelationItem(type, entity): TreasuryRelationItem { ... }
 export function entityToLinkableItem(type, entity): LinkableItem { ... }
 export function getEntityTitle(type, entity): string { ... }
 export function getEntityStatus(type, entity): string { ... }

 Replaces per-picker converters: transactionsToLinkableItems(), receiptsToLinkableItems(), purchasesToLinkableItems(), minutesToLinkableItems(), reimbursementsToLinkableItems().

 ---
 Phase 3: RelationshipPicker Component [DONE]

 3.1 Component API

 File: app/components/relationships/relationship-picker.tsx

 interface RelationshipSection {
   relationBType: RelationshipEntityType;
   linkedEntities: any[];        // From loader
   availableEntities: any[];     // From loader
   maxItems?: number;            // 1 for 1:1, undefined for M:M
   createType?: string;           // For draft-first creation (used with AddItemButton)
   onUpload?: (file: File) => Promise<any>;  // For receipts/minutes
 }
 
 interface RelationshipItem {
   id: string;
   name: string;
   status: string; // "draft", "active", etc.
   needsAttention?: boolean; // True if draft has empty required fields
 }

 interface RelationshipPickerProps {
   relationAType: RelationshipEntityType;
   relationId: string;
   relationAName: string;
   sections: RelationshipSection[];
   mode: "view" | "edit";
   currentPath: string;
   onLink: (relationBType, relationBId, metadata?) => void;
   onUnlink: (relationBType, relationBId) => void;
   showAnalyzeButton?: boolean;
   storageKeyPrefix: string;
 }

  3.2 Internal Structure
 
  <RelationshipPicker>
    {/* 
      NOTE: relationId is required for AI analysis. 
      In "New" routes, we now auto-create a draft immediately (see Phase 6), 
      so relationId should always be present even for "new" items.
    */}
    {showAnalyzeButton && relationId && <AIAnalyzeButton relationAType relationId />}

   {sections.map(section => (
     <RelationActions
       label={t(ENTITY_REGISTRY[section.relationBType].pluralKey)}
       items={entityToRelationItem(linkedEntities)}
       linkableItems={entityToLinkableItem(availableEntities)}
       createType={section.createType || section.relationBType}  // Use draft-first workflow
       relationAEntityType={relationAType}
       relationAEntityId={relationId}
       relationAEntityName={relationAName}
       maxItems={section.maxItems}
       storageKey={`${storageKeyPrefix}-${section.relationBType}`}
       onRemove={id => onUnlink(section.relationBType, id)}
       onSelectionChange={id => onLink(section.relationBType, id)}
       withSeparator
     />
     {section.onUpload && <input type="file" hidden ... />}
   ))}
 </RelationshipPicker>

 Note: RelationActions is preserved as the rendering engine — RelationshipPicker delegates to it.

 3.3 State Management Hook

 File: app/hooks/use-relationship-picker.ts

 export function useRelationshipPicker({ relationAType, relationId, initialRelationships }) {
   // Tracks pending adds/removes for form submission
   const [pendingLinks, setPendingLinks] = useState([]);
   const [pendingUnlinks, setPendingUnlinks] = useState([]);

   handleLink(relationBType, relationBId, metadata?) { ... }
   handleUnlink(relationBType, relationBId) { ... }

   // Serialize for hidden form inputs
   toFormData() { return { links: JSON.stringify(pendingLinks), unlinks: JSON.stringify(pendingUnlinks) }; }
 }

 3.4 AI Analyze Button

 File: app/components/relationships/ai-analyze-button.tsx

 export function AIAnalyzeButton({ relationType, relationId, onComplete }) {
   const handleAnalyze = async () => {
     const toastId = toast.loading(t("relationships.ai.analyzing"));
     try {
       const res = await fetch("/api/relationships/analyze", {
         method: "POST", body: JSON.stringify({ relationType, relationId })
       });
       const result = await res.json();
       toast.success(t("relationships.ai.success", { count: result.createdCount }), { id: toastId });
       onComplete?.(result);  // Triggers page revalidation
     } catch {
       toast.error(t("relationships.ai.error"), {
         id: toastId,
         action: { label: t("common.actions.retry"), onClick: handleAnalyze },
       });
     }
   };
   // Renders shadcn button with auto_awesome icon
 }

 After AI creates drafts, the page revalidates (via useRevalidator) so the new draft entities appear in the picker sections.

 ---
 Phase 4: AI Relationship Analyzer

 4.1 API Endpoint

 New file: app/routes/api.relationships.analyze.tsx

 POST /api/relationships/analyze
 Body: { relationType, relationId }
 Response: { success, createdCount, created: [{ type, id, name }], errors?: string[] }

 Flow:
 1. Auth check (requires receipt processing permission or treasury write)
 2. Fetch relationA entity + its content (receipt OCR data, transaction details, etc.)
 3. Get appropriate analyzer for relationA type
 4. Run AI analysis via OpenRouter
  5. For each suggestion: create draft entity + entity_relationship link
  6. Return created drafts
 
  Refer to `docs/ai_relationships_design.md` for detailed mapping of deterministic vs AI-generated fields for each entity type.

 4.2 Per-Type Analyzers

 New file: app/lib/ai/relationship-analyzer.server.ts

 interface AnalysisSuggestion {
   entityType: RelationshipEntityType;
   name: string; // Draft name
   data: Record<string, any>;   // MUST REPLICATE relationA VALUES (Date, Amount, Description) as defaults
   metadata?: Record<string, any>;  // Relationship metadata
   confidence: number;
   reasoning: string;
 }

 interface EntityAnalyzer {
   analyze(entity: any, db: DatabaseAdapter): Promise<AnalysisSuggestion[]>;
 }

 ReceiptAnalyzer (most important):
 - Reads receiptContents OCR data
 - Sends items + store + total to AI for classification ONLY
 - Suggests: 
   - Inventory items (PROPOSE ALL from receipt content) -> Copies price, name, date. User deletes unwanted.
   - Transaction (expense with category) -> Copies date, amount, merchant. AI suggests category.
   - Reimbursement -> Copies total amount, date, description
 - Each suggestion → draft entity with status: "draft" linked to Receipt relationA

 ReimbursementAnalyzer:
 - Analyzes purchase description + amount + linked receipts
 - Suggests: transaction, inventory items from receipt content

 TransactionAnalyzer:
 - Suggests: inventory items (if category=inventory), budget (match by name/amount)

 MinuteAnalyzer:
 - Suggests: news article (if meeting had noteworthy decisions), FAQ entries

 4.3 Prompt Templates

 New file: app/lib/ai/prompts/relationship-prompts.server.ts

 Receipt prompt example:
 Analyze this receipt and suggest entities to create:
 Store: {storeName}, Total: €{totalAmount}, Date: {purchaseDate}
 Items: {items JSON}

 For each line item determine:
 1. Inventory item? (YES for durable goods, NO for consumables)
 2. Category for the transaction
 3. Should a reimbursement request be created?

 Return JSON: [{ entityType, name, data: {...}, confidence, reasoning }]

 4.4 Existing AI Integration

 Extend app/lib/relationA-context-ai.server.ts — Reuse existing `analyzeReceiptForTransaction` logic for category detection.
 The new analyzer wraps this logic to generate structured AnalysisSuggestions, ensuring consistent categorization across the app.

 ---
 Phase 5: Draft Lifecycle Management

 5.1 Draft Creation by AI

 When AI creates a draft:
 - Entity gets status: "draft" in its table
 - An entity_relationships row links it to the relationA entity
 - metadata on the relationship stores { ai_created: true, confidence: 0.85 }
 - Draft appears in RelationshipPicker with visual "draft" badge (dashed border, muted colors)

 5.2 Cleanup on Unlink

 When a relationship is removed:
 1. Delete the entity_relationships row
 2. Check if the relationB entity is now orphaned (status=draft, no remaining relationships)
 3. If orphaned -> CRITICAL: Auto-delete entity AND associated files (blob storage/uploads) immediately.
    This ensures no junk files accumulate from abandoned drafts.

 5.3 Periodic Cleanup Endpoint

 New file: app/routes/api.drafts.cleanup.tsx

 POST /api/drafts/cleanup (admin only)

 Finds all entities with status: "draft" and zero rows in entity_relationships, older than 24 hours (grace period). Deletes entities and their associated files from blob storage.

 5.4 Admin UI

 Add a "Clean Up Drafts" button to the settings page that calls the cleanup endpoint with toast feedback.

 ---
 Phase 6: Route Integration

  6.1 Immediate Draft Creation (NEW FLOW - "Edit Only")
 
  We will eliminate separate "New" UI pages.
  1. "Create New [Entity]" button (on lists/dashboards) -> POST to an action (e.g. `api/entities/create-draft`).
  2. Action creates empty row with `status="draft"`.
  3. Action returns redirect URL to `/.../$id/edit`.
  4. Result: User always lands on a valid Edit page with a persisted `relationId`.
 
  This unifies the UI—no separate "New" vs "Edit" templates to maintain.
 
  Affected Routes to remove from router and delete files (no need to convert to action/redirect):
  - treasury.receipts.new.tsx
  - treasury.transactions.new.tsx
  - treasury.reimbursement.new.tsx
  - treasury.budgets.new.tsx
  - inventory.new.tsx
  - minutes.new.tsx
  - news.new.tsx
  - faq.new.tsx 
 

 New file: app/lib/relationships/load-relationships.server.ts

 export async function loadRelationshipsForEntity(
   db, entityType, entityId, relationBTypes: RelationshipEntityType[]
 ): Promise<Record<RelationshipEntityType, { linked: any[]; available: any[] }>>

 Queries entity_relationships + legacy FKs (during migration), returns grouped data ready for RelationshipPicker.
 
 6.2 Shared relationA Context Logic (NEW PHASE)
 
 New file: app/lib/relationships/relationship-context.server.ts
 
 Implements the "Domination Scale" logic defined in `docs/relationship_context_design.md`.
 - Determines which relationA (Receipt > Reimbursement > Transaction) sets the truth for `amount`, `date`, `description`.
 - Used by API loaders to pre-fill form fields based on linked relationships.
 
 6.3 Shared Action Helper & Mesh Linking
 
 New file: app/lib/relationships/save-relationships.server.ts
 
 export async function saveRelationshipChanges(
   db, relationAType, relationId, formData, userId
 ): Promise<void>
 
 1. Reads _relationship_links and _relationship_unlinks.
 2. Creates/Deletes relationships.
 3. **Mesh Linking**: Ensures closure. If A is linked to B and C, it auto-links B <-> C if applicable (e.g. Receipt <-> Reimbursement).
 4. Writes to legacy FKs.

 6.4 Routes to Migrate
 ┌───────────────────────────────────────────────┬───────────────────────────────────┬───────────────────────────────────────────┤
 │                     Route                     │        Pickers to Replace         │        RelationshipPicker Sections        │
 ├───────────────────────────────────────────────┼───────────────────────────────────┼───────────────────────────────────────────┤
 │ treasury.receipts.$receiptId.edit.tsx         │ ReimbursementsPicker              │ reimbursement, transaction, inventory     │
 ├───────────────────────────────────────────────┼───────────────────────────────────┼───────────────────────────────────────────┤
 │ treasury.transactions.$transactionId.edit.tsx │ Inventory, Budget, Reimbursements │ inventory, budget, reimbursement, receipt │
 ├───────────────────────────────────────────────┼───────────────────────────────────┼───────────────────────────────────────────┤
 │ treasury.transactions.new.tsx                 │ Inventory, Budget                 │ inventory, budget, reimbursement          │
 ├───────────────────────────────────────────────┼───────────────────────────────────┼───────────────────────────────────────────┤
 │ treasury.reimbursements.$purchaseId.edit.tsx  │ Receipts, Minutes, Transactions   │ receipt, minute, transaction, inventory   │
 ├───────────────────────────────────────────────┼───────────────────────────────────┼───────────────────────────────────────────┤
 │ treasury.reimbursement.new.tsx                │ Receipts, Minutes                 │ receipt, minute, transaction              │
 ├───────────────────────────────────────────────┼───────────────────────────────────┼───────────────────────────────────────────┤
 │ treasury.budgets.$budgetId.edit.tsx           │ TransactionsPicker                │ transaction                               │
 ├───────────────────────────────────────────────┼───────────────────────────────────┼───────────────────────────────────────────┤
 │ inventory.$itemId.edit.tsx                    │ TransactionsPicker                │ transaction, receipt, reimbursement       │
 ├───────────────────────────────────────────────┼───────────────────────────────────┼───────────────────────────────────────────┤
 │ minutes.$minuteId.edit.tsx                    │ Reimbursements, etc.              │ reimbursement, news, faq, inventory       │
 └───────────────────────────────────────────────┴───────────────────────────────────┴───────────────────────────────────────────┘
 Each migration: update loader → replace pickers in component → update action.

 ---
 Phase 7: Backward Compatibility

 7.1 Dual-Read

 loadRelationshipsForEntity queries both the universal table AND legacy FKs/junctions, deduplicates by relationB ID. This ensures existing data is visible even before the migration script
 runs.

 7.2 Write-Through

 When creating a relationship via the universal table, also write to the corresponding legacy FK:
 - (receipt, reimbursement) → receipts.purchaseId
 - (transaction, reimbursement) → transactions.purchaseId
 - (inventory, transaction) → inventoryItemTransactions junction
 - (budget, transaction) → budgetTransactions junction
 - (minute, *) → minuteLinks junction

 7.3 Legacy FK Removal (Future)

 After all routes migrated and verified: remove FKs, junction tables, and legacy-compat code. Not part of this plan.

 ---
 Phase 8: Translations

 New keys in public/locales/{en,fi,de,es,sv}/common.json:

 {
   "common.entity_types.news": "News" / "Uutiset",
   "common.entity_types.faq": "FAQ" / "UKK",
   "relationships.ai.analyze": "Analyze with AI" / "Analysoi tekoälyllä",
   "relationships.ai.analyzing": "Analyzing..." / "Analysoidaan...",
   "relationships.ai.success": "Created {{count}} draft items" / "Luotiin {{count}} luonnosta",
   "relationships.ai.error": "Analysis failed" / "Analysointi epäonnistui",
   "relationships.draft.badge": "Draft" / "Luonnos",
   "relationships.draft.cleanup": "Clean Up Drafts" / "Siivoa luonnokset",
   "relationships.draft.cleanup_success": "Deleted {{count}} drafts" / "Poistettiin {{count}} luonnosta"
 }


use 
 ---
 Implementation Order

 1. Schema + Migration — entity_relationships table, adapter methods
 2. Entity Registry + Converters — Central config, update relationA-context.ts EntityType
 3. RelationshipPicker Component — UI component + hook + AI button
 4. AI Relationship Analyzer — API endpoint, per-type analyzers, prompts
 5. Draft Lifecycle — Cleanup endpoint, on-unlink cleanup, admin UI
 6. Route Integration — Replace pickers in all routes (one at a time, test each)
 7. Data Migration Script — Copy existing FK data to universal table
 8. Translations — All 5 locale files

 ---
 Files Summary
 ┌──────────────┬──────────────────────────────────────────────────────┬────────────────────────────────────────────────────────┐
 │   Category   │                         File                         │                         Action                         │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Schema       │ app/db/schema.ts                                     │ Add entityRelationships table + RelationshipEntityType │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Migration    │ drizzle/XXXX_entity_relationships.sql                │ Create table + indexes                                 │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Adapters     │ app/db/adapters/types.ts                             │ Add 7 new methods                                      │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Adapters     │ app/db/adapters/postgres.ts                          │ Implement methods                                      │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Adapters     │ app/db/adapters/neon.ts                              │ Implement methods                                      │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Registry     │ app/lib/entity-registry.ts                           │ NEW — central entity config                            │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Converters   │ app/lib/entity-converters.ts                         │ NEW — entity→display converters                        │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Component    │ app/components/relationships/relationship-picker.tsx │ NEW — unified picker                                   │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Component    │ app/components/relationships/ai-analyze-button.tsx   │ NEW — AI button with toast                             │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Hook         │ app/hooks/use-relationship-picker.ts                 │ NEW — state management                                 │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ AI           │ app/lib/ai/relationship-analyzer.server.ts           │ NEW — per-type analyzers                               │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ AI           │ app/lib/ai/prompts/relationship-prompts.server.ts    │ NEW — prompt templates                                 │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ API          │ app/routes/api.relationships.analyze.tsx             │ NEW — AI analysis endpoint                             │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ API          │ app/routes/api.drafts.cleanup.tsx                    │ NEW — draft cleanup endpoint                           │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Server       │ app/lib/relationships/load-relationships.server.ts   │ NEW — shared loader helper                             │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Server       │ app/lib/relationships/save-relationships.server.ts   │ NEW — shared action helper                             │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Server       │ app/lib/relationships/legacy-compat.server.ts        │ NEW — backward compat queries                          │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Script       │ scripts/migrate-relationships.ts                     │ NEW — data migration                                   │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Existing     │ app/lib/linking/relationA-context.ts                    │ Add "news", "faq" to EntityType                        │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Routes       │ 10+ detail/edit/new routes                           │ Replace pickers with RelationshipPicker                │
 ├──────────────┼──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ Translations │ public/locales/*/common.json (5 files)               │ Add relationship + AI keys                             │
 └──────────────┴──────────────────────────────────────────────────────┴────────────────────────────────────────────────────────┘
 ---
 Verification

 Test Scenarios

 1. Receipt → AI Analyze — Upload receipt with OCR → Click "Analyze with AI" → Verify drafts created (reimbursement, transaction, inventory items) → Navigate to each draft → Fill in
 details → Verify relationship persists
 2. Draft Cleanup — Create AI drafts → Unlink one → Verify orphaned draft auto-deleted (entity + blob file)
 3. Cross-Entity Navigation — Receipt detail → Click transaction draft → Fill → Save → Back to receipt → Verify both linked
 4. Backward Compatibility — Existing FK-based pages still work during migration → Old URLs still resolve → Existing queries return correct data
 5. Error Handling — AI fails → Error toast with retry button → relation has no analyzable content → Informative message → Partial AI success → Show what succeeded

 Build Verification

 bun run typecheck
 bun run build
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌