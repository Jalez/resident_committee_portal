import type { DatabaseAdapter } from "~/db/adapters/types";
import type {
	EntityRelationship,
	Purchase,
	Receipt,
	RelationshipEntityType,
	Transaction,
} from "~/db/schema";

export interface RelationshipContextLineItem {
	name: string;
	quantity: number;
	unitPrice: number;
	totalPrice: number;
	tags?: string[];
	sourceItemId?: string;
}

export interface RelationshipContext {
	id: string; // The relationship ID (or a virtual one)
	date: Date | null;
	totalAmount: number | null;
	description: string | null;
	currency: string | null;
	category: string | null;
	purchaserId: string | null;
	lineItems: RelationshipContextLineItem[];
	valueSource:
		| "manual"
		| "receipt"
		| "reimbursement"
		| "transaction"
		| "budget"
		| "unknown";
	linkedEntityIds: string[]; // "type:id" strings
}

/**
 * Calculates the RelationshipContext for a given entity by traversing its relationship graph.
 * Uses the Domination Scale (Receipt > Reimbursement > Transaction) to determine
 * the source of truth for shared values.
 */
export async function getRelationshipContext(
	db: DatabaseAdapter,
	entityType: RelationshipEntityType,
	entityId: string,
): Promise<RelationshipContext> {
	// 1. Fetch the relationship graph (all connected entities)
	const graph = await fetchRelationshipGraph(db, entityType, entityId);

	// 2. Determine the Primary Source based on Domination Scale
	const source = determineValueSource(graph);

	// 3. Construct the Context
	return buildContextFromSource(db, source, graph);
}

// --- Helper Types & Functions ---

interface RelationshipGraph {
	receipts: Receipt[];
	reimbursements: Purchase[]; // 'purchases' table
	transactions: Transaction[];
	// We can add minute, budget, etc. later as needed for context source
	allRelationships: EntityRelationship[];
}

async function fetchRelationshipGraph(
	db: DatabaseAdapter,
	startType: RelationshipEntityType,
	startId: string,
): Promise<RelationshipGraph> {
	// This is a simplified graph traversal.
	// For now, we look for direct neighbors of the start node.
	// A robust system might do a BFS to find the whole connected component.

	const relationships = await db.getEntityRelationships(startType, startId);

	const graph: RelationshipGraph = {
		receipts: [],
		reimbursements: [],
		transactions: [],
		allRelationships: relationships,
	};

	// Helper to add entity to graph if not already present
	// (This is naive; in a real BFS we'd track visited IDs)

	const nodesToFetch: { type: RelationshipEntityType; id: string }[] = [];

	// Add direct neighbors from the relationship table
	for (const rel of relationships) {
		if (rel.relationAType === startType && rel.relationId === startId) {
			nodesToFetch.push({ type: rel.relationBType, id: rel.relationBId });
		} else {
			nodesToFetch.push({ type: rel.relationAType, id: rel.relationId });
		}
	}

	// Add self to ensure we have the starting entity's data
	nodesToFetch.push({ type: startType, id: startId });

	// Fetch data for nodes
	// Optimization: Bulk fetch references if adapter supports it, else loop
	for (const node of nodesToFetch) {
		if (node.type === "receipt") {
			const r = await db.getReceiptById(node.id);
			if (r) graph.receipts.push(r);
		} else if (node.type === "reimbursement") {
			const p = await db.getPurchaseById(node.id);
			if (p) graph.reimbursements.push(p);
		} else if (node.type === "transaction") {
			const t = await db.getTransactionById(node.id);
			if (t) graph.transactions.push(t);
		}
	}

	// Deduplicate (naive)
	graph.receipts = [
		...new Map(graph.receipts.map((item) => [item.id, item])).values(),
	];
	graph.reimbursements = [
		...new Map(graph.reimbursements.map((item) => [item.id, item])).values(),
	];
	graph.transactions = [
		...new Map(graph.transactions.map((item) => [item.id, item])).values(),
	];

	return graph;
}

function determineValueSource(graph: RelationshipGraph): {
	type: "manual" | "receipt" | "reimbursement" | "transaction" | "unknown";
	entity: any;
} {
	// 1. Manual Override? (implied if we had a way to store "manual" metadata on the link)
	// For now, assume no manual override storage is implemented yet aside from directly editing the entity.

	// 2. Receipt (Priority 1)
	if (graph.receipts.length > 0) {
		// Return the first valid receipt (or logic to pick 'best')
		return { type: "receipt", entity: graph.receipts[0] };
	}

	// 3. Reimbursement (Priority 2)
	if (graph.reimbursements.length > 0) {
		return { type: "reimbursement", entity: graph.reimbursements[0] };
	}

	// 4. Transaction (Priority 3)
	if (graph.transactions.length > 0) {
		return { type: "transaction", entity: graph.transactions[0] };
	}

	return { type: "unknown", entity: null };
}

async function buildContextFromSource(
	db: DatabaseAdapter,
	source: { type: string; entity: any },
	graph: RelationshipGraph,
): Promise<RelationshipContext> {
	const context: RelationshipContext = {
		id: "virtual-context-id", // In future, maybe store this in DB
		date: null,
		totalAmount: null,
		description: null,
		currency: "EUR",
		category: null,
		purchaserId: null,
		lineItems: [],
		valueSource: source.type as any,
		linkedEntityIds: [], // Populate from graph
	};

	// Populate linked IDs
	graph.receipts.forEach((r) =>
		context.linkedEntityIds.push(`receipt:${r.id}`),
	);
	graph.reimbursements.forEach((p) =>
		context.linkedEntityIds.push(`reimbursement:${p.id}`),
	);
	graph.transactions.forEach((t) =>
		context.linkedEntityIds.push(`transaction:${t.id}`),
	);

	if (source.type === "unknown" || !source.entity) {
		return context;
	}

	// Map values based on source type
	if (source.type === "receipt") {
		const receipt = source.entity as Receipt;
		// Receipt typically needs ReceiptContent for details
		const content = await db.getReceiptContentByReceiptId(receipt.id);

		context.date = content?.purchaseDate ?? null; // Receipt timestamp is creation, content has parsed date
		context.totalAmount = content?.totalAmount
			? Number(content.totalAmount)
			: null;
		context.description = content?.storeName ?? receipt.name ?? null; // Store name is best description
		context.category = null; // AI to fill this later

		if (content?.items) {
			try {
				const parsedItems = JSON.parse(content.items);
				context.lineItems = parsedItems.map((item: any) => ({
					name: item.name,
					quantity: item.quantity,
					unitPrice: Number(item.unitPrice),
					totalPrice: Number(item.totalPrice),
					sourceItemId: item.name, // Weak ID, but what we have
				}));
			} catch (e) {
				console.error("Failed to parse receipt items", e);
			}
		}
	} else if (source.type === "reimbursement") {
		const purchase = source.entity as Purchase;
		context.date = purchase.createdAt; // Approximate
		context.totalAmount = Number(purchase.amount);
		context.description = purchase.description ?? purchase.minutesName;
		context.purchaserId = null; // Need to resolve purchaserName to ID if possible?
	} else if (source.type === "transaction") {
		const transaction = source.entity as Transaction;
		context.date = transaction.date;
		context.totalAmount = Math.abs(Number(transaction.amount)); // transactions are often negative
		context.description = transaction.description;
		context.category = transaction.category;
	}

	return context;
}

/**
 * Propagates the values from the RelationshipContext to all linked entities.
 * This ensures that if the Context Source (e.g. Receipt) changes, or if the user
 * manually edits the Context, all other entities stay in sync.
 */
export async function propagateContext(
	db: DatabaseAdapter,
	context: RelationshipContext,
): Promise<void> {
	for (const linkStr of context.linkedEntityIds) {
		const [type, id] = linkStr.split(":");
		if (!type || !id) continue;

		try {
			if (type === "transaction") {
				// Transaction follows context
				await db.updateTransaction(id, {
					// Start with basic sync
					amount: context.totalAmount
						? (-context.totalAmount).toString()
						: undefined, // Transactions are usually negative expenses
					date: context.date || undefined,
					description: context.description || undefined,
					category: context.category || undefined,
				});
			} else if (type === "reimbursement") {
				// Reimbursement follows context
				await db.updatePurchase(id, {
					amount: context.totalAmount
						? context.totalAmount.toString()
						: undefined,
					description: context.description || undefined,
					// If context has category, might put it in notes or minutesName if no category field?
					// Purchase table doesn't have 'category' column yet? Helper says 'category' is in Transaction.
				});
			} else if (type === "receipt") {
				// Receipt is usually the source, but if context is "manual" override, maybe we update receipt metadata?
				// Receipt metadata (name/desc) can be updated.
				await db.updateReceipt(id, {
					name: context.description || undefined, // Use description as name?
					// Date/Amount are in receiptContents, which is OCR data.
					// We typically don't overwrite OCR data unless we explicitly mean to "correct" it.
					// For now, let's leave Receipt Content alone to preserve "original truth".
				});
			}
		} catch (err) {
			console.error(`Failed to propagate context to ${type}:${id}`, err);
		}
	}
}
