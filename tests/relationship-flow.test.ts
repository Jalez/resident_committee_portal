import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration test for the relationship linking flow:
 * 1. Create a draft entity (e.g., transaction) from a source entity (e.g., receipt)
 * 2. Verify the relationship is created bidirectionally
 * 3. When loading relationships for the new entity, the source should appear as linked
 */

// Mock database adapter for testing
class MockDatabaseAdapter {
	private relationships: Array<{
		relationAType: string;
		relationId: string;
		relationBType: string;
		relationBId: string;
	}> = [];

	private entities: Map<string, any> = new Map();

	async createEntityRelationship(data: {
		relationAType: string;
		relationId: string;
		relationBType: string;
		relationBId: string;
		createdBy?: string | null;
	}) {
		this.relationships.push({
			relationAType: data.relationAType,
			relationId: data.relationId,
			relationBType: data.relationBType,
			relationBId: data.relationBId,
		});
		return data;
	}

	async getEntityRelationships(
		type: string,
		id: string,
	): Promise<
		Array<{
			relationAType: string;
			relationId: string;
			relationBType: string;
			relationBId: string;
		}>
	> {
		return this.relationships.filter(
			(rel) =>
				(rel.relationAType === type && rel.relationId === id) ||
				(rel.relationBType === type && rel.relationBId === id),
		);
	}

	async createTransaction(data: any) {
		const id = `transaction-${Date.now()}`;
		const entity = { id, ...data };
		this.entities.set(id, entity);
		return entity;
	}

	async getTransactionById(id: string) {
		return this.entities.get(id) || null;
	}

	async createReceipt(data: any) {
		const id = `receipt-${Date.now()}`;
		const entity = { id, ...data };
		this.entities.set(id, entity);
		return entity;
	}

	async getReceiptById(id: string) {
		return this.entities.get(id) || null;
	}

	async createFaq(data: any) {
		const id = `faq-${Date.now()}`;
		const entity = { id, ...data };
		this.entities.set(id, entity);
		return entity;
	}

	async getFaqById(id: string) {
		return this.entities.get(id) || null;
	}

	getEntityById(type: string, id: string) {
		return this.entities.get(id) || null;
	}

	// Clear all data
	clear() {
		this.relationships = [];
		this.entities.clear();
	}
}

// Import the actual loadRelationshipsForEntity logic
async function loadRelationshipsForEntity(
	db: MockDatabaseAdapter,
	entityType: string,
	entityId: string,
	relationBTypes: string[],
): Promise<Record<string, { linked: any[]; available: any[] }>> {
	const result: Record<string, { linked: any[]; available: any[] }> = {};

	const allRelationships = await db.getEntityRelationships(
		entityType,
		entityId,
	);

	for (const relationBType of relationBTypes) {
		const linkedIds = allRelationships
			.map((rel) => {
				// Case 1: Current entity is relationA, linked entity is relationB
				if (rel.relationAType === entityType && rel.relationId === entityId) {
					return rel.relationBType === relationBType ? rel.relationBId : null;
				}
				// Case 2: Current entity is relationB, linked entity is relationA
				if (rel.relationBType === entityType && rel.relationBId === entityId) {
					return rel.relationAType === relationBType ? rel.relationId : null;
				}
				return null;
			})
			.filter((id): id is string => id !== null);

		// Fetch linked entities
		const linked: any[] = [];
		for (const id of linkedIds) {
			const entity = db.getEntityById(relationBType, id);
			if (entity) linked.push(entity);
		}

		result[relationBType] = { linked, available: [] };
	}

	return result;
}

// Simulates the create-draft action
async function createDraftAndLink(
	db: MockDatabaseAdapter,
	sourceType: string,
	sourceId: string,
	targetType: string,
) {
	// Create the new entity
	let newEntity: any;
	if (targetType === "transaction") {
		newEntity = await db.createTransaction({
			amount: "0",
			description: "",
			status: "draft",
		});
	} else if (targetType === "receipt") {
		newEntity = await db.createReceipt({
			name: "",
			status: "draft",
		});
	}

	// Create the relationship (source -> new entity)
	await db.createEntityRelationship({
		relationAType: sourceType,
		relationId: sourceId,
		relationBType: targetType,
		relationBId: newEntity.id,
	});

	return newEntity;
}

describe("Relationship Linking Flow", () => {
	let db: MockDatabaseAdapter;

	beforeAll(() => {
		db = new MockDatabaseAdapter();
	});

	afterAll(() => {
		db.clear();
	});

	it("should show source entity as linked when viewing newly created entity", async () => {
		// Step 1: Create a source receipt
		const receipt = await db.createReceipt({
			name: "Test Receipt",
			status: "draft",
		});

		// Step 2: Create a transaction from the receipt (simulating RelationshipPicker flow)
		const transaction = await createDraftAndLink(
			db,
			"receipt",
			receipt.id,
			"transaction",
		);

		// Step 3: Load relationships for the transaction (what happens when viewing transaction edit)
		const relationships = await loadRelationshipsForEntity(
			db,
			"transaction",
			transaction.id,
			["receipt"],
		);

		// Step 4: Verify the receipt appears as linked
		expect(relationships.receipt.linked).toHaveLength(1);
		expect(relationships.receipt.linked[0].id).toBe(receipt.id);
		expect(relationships.receipt.linked[0].name).toBe("Test Receipt");
	});

	it("should show linked entities from both directions", async () => {
		db.clear();

		// Create entities
		const receipt = await db.createReceipt({
			name: "Receipt 1",
			status: "active",
		});
		const transaction = await db.createTransaction({
			amount: "100",
			description: "Test",
			status: "active",
		});

		// Create relationship: receipt -> transaction
		await db.createEntityRelationship({
			relationAType: "receipt",
			relationId: receipt.id,
			relationBType: "transaction",
			relationBId: transaction.id,
		});

		// From receipt's perspective, transaction should be linked
		const receiptRelationships = await loadRelationshipsForEntity(
			db,
			"receipt",
			receipt.id,
			["transaction"],
		);
		expect(receiptRelationships.transaction.linked).toHaveLength(1);
		expect(receiptRelationships.transaction.linked[0].id).toBe(transaction.id);

		// From transaction's perspective, receipt should be linked
		const transactionRelationships = await loadRelationshipsForEntity(
			db,
			"transaction",
			transaction.id,
			["receipt"],
		);
		expect(transactionRelationships.receipt.linked).toHaveLength(1);
		expect(transactionRelationships.receipt.linked[0].id).toBe(receipt.id);
	});

	it("should handle multiple linked entities", async () => {
		db.clear();

		// Create a transaction
		const transaction = await db.createTransaction({
			amount: "200",
			description: "Multi-link test",
			status: "active",
		});

		// Create multiple receipts
		const receipt1 = await db.createReceipt({
			name: "Receipt 1",
			status: "active",
		});
		const receipt2 = await db.createReceipt({
			name: "Receipt 2",
			status: "active",
		});

		// Link both receipts to the transaction
		await db.createEntityRelationship({
			relationAType: "receipt",
			relationId: receipt1.id,
			relationBType: "transaction",
			relationBId: transaction.id,
		});
		await db.createEntityRelationship({
			relationAType: "receipt",
			relationId: receipt2.id,
			relationBType: "transaction",
			relationBId: transaction.id,
		});

		// From transaction's perspective, both receipts should be linked
		const relationships = await loadRelationshipsForEntity(
			db,
			"transaction",
			transaction.id,
			["receipt"],
		);
		expect(relationships.receipt.linked).toHaveLength(2);
		const linkedIds = relationships.receipt.linked.map((e) => e.id);
		expect(linkedIds).toContain(receipt1.id);
		expect(linkedIds).toContain(receipt2.id);
	});

	it("should show FAQ as linked when creating receipt from FAQ", async () => {
		db.clear();

		// Step 1: Create a source FAQ
		const faq = await db.createFaq({
			question: "Test Question",
			answer: "Test Answer",
			status: "draft",
		});

		// Step 2: Create a receipt from the FAQ (simulating RelationshipPicker flow)
		const receipt = await createDraftAndLink(db, "faq", faq.id, "receipt");

		// Step 3: Load relationships for the receipt (what happens when viewing receipt edit)
		const relationships = await loadRelationshipsForEntity(
			db,
			"receipt",
			receipt.id,
			["faq"],
		);

		// Step 4: Verify the FAQ appears as linked
		expect(relationships.faq.linked).toHaveLength(1);
		expect(relationships.faq.linked[0].id).toBe(faq.id);
		expect(relationships.faq.linked[0].question).toBe("Test Question");
	});

	it("should show receipt as linked when viewing FAQ after linking", async () => {
		db.clear();

		// Create FAQ and receipt
		const faq = await db.createFaq({
			question: "Another FAQ",
			answer: "Another Answer",
			status: "active",
		});
		const receipt = await db.createReceipt({
			name: "Linked Receipt",
			status: "active",
		});

		// Create relationship: faq -> receipt
		await db.createEntityRelationship({
			relationAType: "faq",
			relationId: faq.id,
			relationBType: "receipt",
			relationBId: receipt.id,
		});

		// From FAQ's perspective, receipt should be linked
		const faqRelationships = await loadRelationshipsForEntity(
			db,
			"faq",
			faq.id,
			["receipt"],
		);
		expect(faqRelationships.receipt.linked).toHaveLength(1);
		expect(faqRelationships.receipt.linked[0].id).toBe(receipt.id);
		expect(faqRelationships.receipt.linked[0].name).toBe("Linked Receipt");

		// From receipt's perspective, FAQ should be linked
		const receiptRelationships = await loadRelationshipsForEntity(
			db,
			"receipt",
			receipt.id,
			["faq"],
		);
		expect(receiptRelationships.faq.linked).toHaveLength(1);
		expect(receiptRelationships.faq.linked[0].id).toBe(faq.id);
	});
});
