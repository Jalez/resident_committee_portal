import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RelationshipEntityType } from "~/db/types";
import {
	getEntityPriority,
	getRelationshipContext,
	shouldOverride,
} from "~/lib/relationships/relationship-context.server";

type MockRelationship = {
	id: string;
	relationAType: RelationshipEntityType;
	relationId: string;
	relationBType: RelationshipEntityType;
	relationBId: string;
};

type MockReceipt = {
	id: string;
	name: string;
	createdBy: string | null;
	purchaseDate: Date | null;
	totalAmount: number | null;
	storeName: string | null;
	currency: string | null;
	items: string;
};

type MockPurchase = {
	id: string;
	amount: number | null;
	description: string | null;
	createdAt: Date;
	createdBy: string | null;
};

type MockTransaction = {
	id: string;
	amount: number | null;
	description: string | null;
	date: Date | null;
	category: string | null;
};

function createMockDatabase() {
	const relationships: MockRelationship[] = [];
	const receipts: MockReceipt[] = [];
	const purchases: MockPurchase[] = [];
	const transactions: MockTransaction[] = [];

	return {
		relationships,
		receipts,
		purchases,
		transactions,

		async getEntityRelationships(
			entityType: RelationshipEntityType,
			entityId: string,
		): Promise<MockRelationship[]> {
			return relationships.filter(
				(rel) =>
					(rel.relationAType === entityType && rel.relationId === entityId) ||
					(rel.relationBType === entityType && rel.relationBId === entityId),
			);
		},

		async getReceiptById(id: string): Promise<MockReceipt | null> {
			return receipts.find((r) => r.id === id) || null;
		},

		async getPurchaseById(id: string): Promise<MockPurchase | null> {
			return purchases.find((p) => p.id === id) || null;
		},

		async getTransactionById(id: string): Promise<MockTransaction | null> {
			return transactions.find((t) => t.id === id) || null;
		},

		addReceipt(receipt: Partial<MockReceipt> & { id: string }) {
			receipts.push({
				name: "Test Receipt",
				createdBy: null,
				purchaseDate: null,
				totalAmount: null,
				storeName: null,
				currency: "EUR",
				items: "[]",
				...receipt,
			});
		},

		addPurchase(purchase: Partial<MockPurchase> & { id: string }) {
			purchases.push({
				amount: null,
				description: null,
				createdAt: new Date("2024-01-15"),
				createdBy: null,
				...purchase,
			});
		},

		addTransaction(transaction: Partial<MockTransaction> & { id: string }) {
			transactions.push({
				amount: null,
				description: null,
				date: null,
				category: null,
				...transaction,
			});
		},

		addRelationship(
			relationAType: RelationshipEntityType,
			relationId: string,
			relationBType: RelationshipEntityType,
			relationBId: string,
		) {
			relationships.push({
				id: `rel-${relationAType}-${relationId}-${relationBType}-${relationBId}`,
				relationAType,
				relationId,
				relationBType,
				relationBId,
			});
		},

		clear() {
			relationships.length = 0;
			receipts.length = 0;
			purchases.length = 0;
			transactions.length = 0;
		},
	};
}

describe("Relationship Context - Priority Scale", () => {
	describe("getEntityPriority", () => {
		it("returns 4 for manual (ultimate priority)", () => {
			expect(getEntityPriority("manual")).toBe(4);
		});

		it("returns 3 for receipt (high priority)", () => {
			expect(getEntityPriority("receipt")).toBe(3);
		});

		it("returns 2 for reimbursement (medium priority)", () => {
			expect(getEntityPriority("reimbursement")).toBe(2);
		});

		it("returns 1 for transaction (low priority)", () => {
			expect(getEntityPriority("transaction")).toBe(1);
		});

		it("returns 0 for non-financial entity types", () => {
			expect(getEntityPriority("budget")).toBe(0);
			expect(getEntityPriority("inventory")).toBe(0);
			expect(getEntityPriority("minute")).toBe(0);
			expect(getEntityPriority("news")).toBe(0);
			expect(getEntityPriority("faq")).toBe(0);
			expect(getEntityPriority("poll")).toBe(0);
			expect(getEntityPriority("social")).toBe(0);
			expect(getEntityPriority("event")).toBe(0);
			expect(getEntityPriority("mail")).toBe(0);
		});
	});

	describe("shouldOverride", () => {
		it("manual overrides receipt", () => {
			expect(shouldOverride("manual", "receipt")).toBe(true);
		});

		it("manual overrides reimbursement", () => {
			expect(shouldOverride("manual", "reimbursement")).toBe(true);
		});

		it("manual overrides transaction", () => {
			expect(shouldOverride("manual", "transaction")).toBe(true);
		});

		it("receipt overrides reimbursement", () => {
			expect(shouldOverride("receipt", "reimbursement")).toBe(true);
		});

		it("receipt overrides transaction", () => {
			expect(shouldOverride("receipt", "transaction")).toBe(true);
		});

		it("reimbursement overrides transaction", () => {
			expect(shouldOverride("reimbursement", "transaction")).toBe(true);
		});

		it("transaction does not override receipt", () => {
			expect(shouldOverride("transaction", "receipt")).toBe(false);
		});

		it("reimbursement does not override receipt", () => {
			expect(shouldOverride("reimbursement", "receipt")).toBe(false);
		});

		it("transaction does not override reimbursement", () => {
			expect(shouldOverride("transaction", "reimbursement")).toBe(false);
		});

		it("equal priority does not override", () => {
			expect(shouldOverride("receipt", "receipt")).toBe(false);
			expect(shouldOverride("reimbursement", "reimbursement")).toBe(false);
			expect(shouldOverride("transaction", "transaction")).toBe(false);
		});
	});
});

describe("Relationship Context - Context Resolution", () => {
	let db: ReturnType<typeof createMockDatabase>;

	beforeEach(() => {
		db = createMockDatabase();
	});

	afterEach(() => {
		db.clear();
	});

	describe("empty relationships", () => {
		it("returns null values when no entity ID provided", async () => {
			const context = await getRelationshipContext(
				db as any,
				"transaction",
				null,
			);

			expect(context.date).toBeNull();
			expect(context.totalAmount).toBeNull();
			expect(context.description).toBeNull();
			expect(context.valueSource).toBeNull();
		});

		it("returns null values when entity has no linked entities", async () => {
			db.addTransaction({ id: "tx-1" });

			const context = await getRelationshipContext(
				db as any,
				"transaction",
				"tx-1",
			);

			expect(context.date).toBeNull();
			expect(context.totalAmount).toBeNull();
			expect(context.description).toBeNull();
			expect(context.valueSource).toBeNull();
		});
	});

	describe("single linked entity", () => {
		it("uses transaction values when only transaction is linked", async () => {
			const testDate = new Date("2024-03-15");
			db.addTransaction({
				id: "tx-1",
				amount: 150.5,
				description: "K-MARKET 1234",
				date: testDate,
				category: "Groceries",
			});
			db.addRelationship("transaction", "tx-1", "receipt", "r-1");

			const context = await getRelationshipContext(db as any, "receipt", "r-1");

			expect(context.date).toEqual(testDate);
			expect(context.totalAmount).toBe(150.5);
			expect(context.description).toBe("K-MARKET 1234");
			expect(context.category).toBe("Groceries");
			expect(context.valueSource).toBe("transaction");
		});

		it("uses reimbursement values when only reimbursement is linked", async () => {
			const testDate = new Date("2024-02-20");
			db.addPurchase({
				id: "p-1",
				amount: 75.0,
				description: "Team lunch reimbursement",
				createdAt: testDate,
				createdBy: "user-123",
			});
			db.addRelationship("reimbursement", "p-1", "transaction", "tx-1");

			const context = await getRelationshipContext(
				db as any,
				"transaction",
				"tx-1",
			);

			expect(context.date).toEqual(testDate);
			expect(context.totalAmount).toBe(75.0);
			expect(context.description).toBe("Team lunch reimbursement");
			expect(context.purchaserId).toBe("user-123");
			expect(context.valueSource).toBe("reimbursement");
		});

		it("uses receipt values when only receipt is linked", async () => {
			const testDate = new Date("2024-01-10");
			db.addReceipt({
				id: "r-1",
				createdBy: "user-456",
				purchaseDate: testDate,
				totalAmount: 42.99,
				storeName: "K-Market Oulu",
				currency: "EUR",
				items: JSON.stringify([
					{ name: "Milk", quantity: 2, price: 1.5, total: 3.0 },
					{ name: "Bread", quantity: 1, price: 2.99, total: 2.99 },
				]),
			});
			db.addRelationship("receipt", "r-1", "transaction", "tx-1");

			const context = await getRelationshipContext(
				db as any,
				"transaction",
				"tx-1",
			);

			expect(context.date).toEqual(testDate);
			expect(context.totalAmount).toBe(42.99);
			expect(context.description).toBe("K-Market Oulu");
			expect(context.currency).toBe("EUR");
			expect(context.purchaserId).toBe("user-456");
			expect(context.valueSource).toBe("receipt");
			expect(context.lineItems).toHaveLength(2);
			expect(context.lineItems[0].name).toBe("Milk");
			expect(context.lineItems[1].name).toBe("Bread");
		});
	});

	describe("multiple linked entities - domination", () => {
		it("receipt wins over reimbursement when both linked", async () => {
			const receiptDate = new Date("2024-03-01");
			const reimbDate = new Date("2024-02-15");

			db.addReceipt({
				id: "r-1",
				purchaseDate: receiptDate,
				totalAmount: 100.0,
				storeName: "Store from Receipt",
			});
			db.addPurchase({
				id: "p-1",
				amount: 80.0,
				description: "Description from Reimbursement",
				createdAt: reimbDate,
			});

			db.addRelationship("receipt", "r-1", "transaction", "tx-1");
			db.addRelationship("reimbursement", "p-1", "transaction", "tx-1");

			const context = await getRelationshipContext(
				db as any,
				"transaction",
				"tx-1",
			);

			expect(context.valueSource).toBe("receipt");
			expect(context.totalAmount).toBe(100.0);
			expect(context.description).toBe("Store from Receipt");
			expect(context.date).toEqual(receiptDate);
		});

		it("receipt wins over transaction when both linked", async () => {
			const receiptDate = new Date("2024-03-01");
			const txDate = new Date("2024-02-28");

			db.addReceipt({
				id: "r-1",
				purchaseDate: receiptDate,
				totalAmount: 50.0,
				storeName: "Receipt Store",
			});
			db.addTransaction({
				id: "tx-1",
				amount: 45.0,
				description: "Transaction Description",
				date: txDate,
			});

			db.addRelationship("receipt", "r-1", "reimbursement", "p-1");
			db.addRelationship("transaction", "tx-1", "reimbursement", "p-1");

			const context = await getRelationshipContext(
				db as any,
				"reimbursement",
				"p-1",
			);

			expect(context.valueSource).toBe("receipt");
			expect(context.totalAmount).toBe(50.0);
			expect(context.description).toBe("Receipt Store");
		});

		it("reimbursement wins over transaction when both linked", async () => {
			const reimbDate = new Date("2024-03-05");

			db.addPurchase({
				id: "p-1",
				amount: 200.0,
				description: "Reimbursement Description",
				createdAt: reimbDate,
			});
			db.addTransaction({
				id: "tx-1",
				amount: 195.0,
				description: "Bank Transaction",
				date: new Date("2024-03-04"),
			});

			db.addRelationship("reimbursement", "p-1", "receipt", "r-1");
			db.addRelationship("transaction", "tx-1", "receipt", "r-1");

			const context = await getRelationshipContext(db as any, "receipt", "r-1");

			expect(context.valueSource).toBe("reimbursement");
			expect(context.totalAmount).toBe(200.0);
			expect(context.description).toBe("Reimbursement Description");
		});

		it("receipt wins when all three types are linked", async () => {
			db.addReceipt({
				id: "r-1",
				purchaseDate: new Date("2024-01-01"),
				totalAmount: 300.0,
				storeName: "Highest Priority - Receipt",
			});
			db.addPurchase({
				id: "p-1",
				amount: 250.0,
				description: "Medium Priority - Reimbursement",
				createdAt: new Date("2024-01-02"),
			});
			db.addTransaction({
				id: "tx-1",
				amount: 240.0,
				description: "Low Priority - Transaction",
				date: new Date("2024-01-03"),
			});

			db.addRelationship("receipt", "r-1", "inventory", "inv-1");
			db.addRelationship("reimbursement", "p-1", "inventory", "inv-1");
			db.addRelationship("transaction", "tx-1", "inventory", "inv-1");

			const context = await getRelationshipContext(
				db as any,
				"inventory",
				"inv-1",
			);

			expect(context.valueSource).toBe("receipt");
			expect(context.totalAmount).toBe(300.0);
			expect(context.description).toBe("Highest Priority - Receipt");
		});
	});

	describe("manual overrides", () => {
		it("manual description overrides entity values", async () => {
			db.addReceipt({
				id: "r-1",
				purchaseDate: new Date("2024-01-01"),
				totalAmount: 100.0,
				storeName: "Store Name",
			});
			db.addRelationship("receipt", "r-1", "transaction", "tx-1");

			const context = await getRelationshipContext(
				db as any,
				"transaction",
				"tx-1",
				{ description: "My Custom Description" },
			);

			expect(context.valueSource).toBe("manual");
			expect(context.description).toBe("My Custom Description");
			expect(context.totalAmount).toBe(100.0);
		});

		it("manual totalAmount overrides entity values", async () => {
			db.addTransaction({
				id: "tx-1",
				amount: 50.0,
				description: "Original",
				date: new Date(),
			});
			db.addRelationship("transaction", "tx-1", "receipt", "r-1");

			const context = await getRelationshipContext(
				db as any,
				"receipt",
				"r-1",
				{ totalAmount: 75.0 },
			);

			expect(context.valueSource).toBe("manual");
			expect(context.totalAmount).toBe(75.0);
		});

		it("manual date overrides entity values", async () => {
			const manualDate = new Date("2024-12-25");
			db.addPurchase({
				id: "p-1",
				amount: 100.0,
				description: "Reimbursement",
				createdAt: new Date("2024-01-01"),
			});
			db.addRelationship("reimbursement", "p-1", "transaction", "tx-1");

			const context = await getRelationshipContext(
				db as any,
				"transaction",
				"tx-1",
				{ date: manualDate },
			);

			expect(context.valueSource).toBe("manual");
			expect(context.date).toEqual(manualDate);
		});

		it("manual overrides without any linked entities", async () => {
			const context = await getRelationshipContext(
				db as any,
				"transaction",
				null,
				{
					description: "Manual Only",
					totalAmount: 99.99,
					date: new Date("2024-06-01"),
				},
			);

			expect(context.valueSource).toBe("manual");
			expect(context.description).toBe("Manual Only");
			expect(context.totalAmount).toBe(99.99);
		});
	});
});

describe("Relationship Context - Entity Value Mapping", () => {
	let db: ReturnType<typeof createMockDatabase>;

	beforeEach(() => {
		db = createMockDatabase();
	});

	afterEach(() => {
		db.clear();
	});

	describe("receipt value mapping", () => {
		it("maps all receipt fields correctly", async () => {
			const testDate = new Date("2024-05-15T10:30:00Z");
			db.addReceipt({
				id: "r-1",
				createdBy: "user-789",
				purchaseDate: testDate,
				totalAmount: 156.78,
				storeName: "Prisma Helsinki",
				currency: "EUR",
				items: JSON.stringify([
					{
						name: "Coffee",
						quantity: 2,
						price: 5.99,
						total: 11.98,
						id: "item-1",
					},
					{
						name: "Sugar",
						quantity: 1,
						price: 2.5,
						total: 2.5,
						id: "item-2",
					},
				]),
			});
			db.addRelationship("receipt", "r-1", "transaction", "tx-1");

			const context = await getRelationshipContext(
				db as any,
				"transaction",
				"tx-1",
			);

			expect(context.date).toEqual(testDate);
			expect(context.totalAmount).toBe(156.78);
			expect(context.description).toBe("Prisma Helsinki");
			expect(context.currency).toBe("EUR");
			expect(context.purchaserId).toBe("user-789");
			expect(context.valueSource).toBe("receipt");
			expect(context.lineItems).toHaveLength(2);
			expect(context.lineItems[0]).toEqual({
				name: "Coffee",
				quantity: 2,
				unitPrice: 5.99,
				totalPrice: 11.98,
				sourceItemId: "item-1",
			});
		});

		it("handles receipt without OCR data gracefully", async () => {
			db.addReceipt({ id: "r-1", createdBy: "user-1" });
			db.addRelationship("receipt", "r-1", "transaction", "tx-1");

			const context = await getRelationshipContext(
				db as any,
				"transaction",
				"tx-1",
			);

			expect(context.valueSource).toBe("receipt");
			expect(context.totalAmount).toBeNull();
			expect(context.description).toBeNull();
			expect(context.date).toBeNull();
		});

		it("handles malformed items JSON", async () => {
			db.addReceipt({
				id: "r-1",
				purchaseDate: new Date(),
				totalAmount: 50.0,
				storeName: "Store",
				items: "not valid json",
			});
			db.addRelationship("receipt", "r-1", "transaction", "tx-1");

			const context = await getRelationshipContext(
				db as any,
				"transaction",
				"tx-1",
			);

			expect(context.valueSource).toBe("receipt");
			expect(context.lineItems).toEqual([]);
		});
	});

	describe("reimbursement value mapping", () => {
		it("maps all reimbursement fields correctly", async () => {
			const testDate = new Date("2024-04-20T14:00:00Z");
			db.addPurchase({
				id: "p-1",
				amount: 89.5,
				description: "Conference tickets",
				createdAt: testDate,
				createdBy: "user-456",
			});
			db.addRelationship("reimbursement", "p-1", "transaction", "tx-1");

			const context = await getRelationshipContext(
				db as any,
				"transaction",
				"tx-1",
			);

			expect(context.date).toEqual(testDate);
			expect(context.totalAmount).toBe(89.5);
			expect(context.description).toBe("Conference tickets");
			expect(context.currency).toBe("EUR");
			expect(context.purchaserId).toBe("user-456");
			expect(context.valueSource).toBe("reimbursement");
		});

		it("handles null amount gracefully", async () => {
			db.addPurchase({
				id: "p-1",
				amount: null,
				description: "No amount",
				createdAt: new Date(),
			});
			db.addRelationship("reimbursement", "p-1", "transaction", "tx-1");

			const context = await getRelationshipContext(
				db as any,
				"transaction",
				"tx-1",
			);

			expect(context.valueSource).toBe("reimbursement");
			expect(context.totalAmount).toBeNull();
		});

		it("handles null description gracefully", async () => {
			db.addPurchase({
				id: "p-1",
				amount: 100.0,
				description: null,
				createdAt: new Date(),
			});
			db.addRelationship("reimbursement", "p-1", "transaction", "tx-1");

			const context = await getRelationshipContext(
				db as any,
				"transaction",
				"tx-1",
			);

			expect(context.valueSource).toBe("reimbursement");
			expect(context.description).toBeNull();
		});
	});

	describe("transaction value mapping", () => {
		it("maps all transaction fields correctly", async () => {
			const testDate = new Date("2024-03-10");
			db.addTransaction({
				id: "tx-1",
				amount: -250.0,
				description: "K-MARKET 4567",
				date: testDate,
				category: "Groceries",
			});
			db.addRelationship("transaction", "tx-1", "receipt", "r-1");

			const context = await getRelationshipContext(db as any, "receipt", "r-1");

			expect(context.date).toEqual(testDate);
			expect(context.totalAmount).toBe(-250.0);
			expect(context.description).toBe("K-MARKET 4567");
			expect(context.currency).toBe("EUR");
			expect(context.category).toBe("Groceries");
			expect(context.valueSource).toBe("transaction");
		});

		it("handles null values gracefully", async () => {
			db.addTransaction({
				id: "tx-1",
				amount: null,
				description: null,
				date: null,
				category: null,
			});
			db.addRelationship("transaction", "tx-1", "receipt", "r-1");

			const context = await getRelationshipContext(db as any, "receipt", "r-1");

			expect(context.valueSource).toBe("transaction");
			expect(context.totalAmount).toBeNull();
			expect(context.description).toBeNull();
			expect(context.date).toBeNull();
		});
	});
});

describe("Relationship Context - Direct Links Only", () => {
	let db: ReturnType<typeof createMockDatabase>;

	beforeEach(() => {
		db = createMockDatabase();
	});

	afterEach(() => {
		db.clear();
	});

	it("only considers directly linked entities for context", async () => {
		db.addReceipt({
			id: "r-1",
			purchaseDate: new Date("2024-01-01"),
			totalAmount: 100.0,
			storeName: "Receipt Store",
		});
		db.addPurchase({
			id: "p-1",
			amount: 200.0,
			description: "Reimbursement Desc",
			createdAt: new Date("2024-01-02"),
		});
		db.addTransaction({
			id: "tx-1",
			amount: 150.0,
			description: "Transaction Desc",
			date: new Date("2024-01-03"),
		});

		db.addRelationship("receipt", "r-1", "transaction", "tx-1");
		db.addRelationship("transaction", "tx-1", "reimbursement", "p-1");

		const contextForReceipt = await getRelationshipContext(
			db as any,
			"receipt",
			"r-1",
		);
		expect(contextForReceipt.valueSource).toBe("transaction");
		expect(contextForReceipt.totalAmount).toBe(150.0);

		const contextForTransaction = await getRelationshipContext(
			db as any,
			"transaction",
			"tx-1",
		);
		expect(contextForTransaction.valueSource).toBe("receipt");
		expect(contextForTransaction.totalAmount).toBe(100.0);

		const contextForReimbursement = await getRelationshipContext(
			db as any,
			"reimbursement",
			"p-1",
		);
		expect(contextForReimbursement.valueSource).toBe("transaction");
		expect(contextForReimbursement.totalAmount).toBe(150.0);
	});

	it("indirect relationship does not affect context", async () => {
		db.addReceipt({
			id: "r-1",
			purchaseDate: new Date(),
			totalAmount: 500.0,
			storeName: "Expensive Receipt",
		});
		db.addTransaction({
			id: "tx-1",
			amount: 50.0,
			description: "Cheap Transaction",
			date: new Date(),
		});

		db.addRelationship("receipt", "r-1", "transaction", "tx-1");

		const contextForUnlinkedReimbursement = await getRelationshipContext(
			db as any,
			"reimbursement",
			"p-unlinked",
		);
		expect(contextForUnlinkedReimbursement.valueSource).toBeNull();
		expect(contextForUnlinkedReimbursement.totalAmount).toBeNull();
	});
});
