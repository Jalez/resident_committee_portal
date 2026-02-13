import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RelationshipEntityType } from "~/db/types";
import {
	getEntityPriority,
	getRelationshipContext,
	shouldOverride,
} from "~/lib/relationships/relationship-context.server";
import type { RelationshipContextValues } from "~/lib/relationships/relationship-context.server";

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
};

type MockReceiptContent = {
	id: string;
	receiptId: string;
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
	const receiptContents: MockReceiptContent[] = [];
	const purchases: MockPurchase[] = [];
	const transactions: MockTransaction[] = [];

	const updateLogs: Array<{
		type: string;
		id: string;
		updates: Record<string, unknown>;
	}> = [];

	return {
		relationships,
		receipts,
		receiptContents,
		purchases,
		transactions,
		updateLogs,

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

		async getReceiptContentByReceiptId(
			receiptId: string,
		): Promise<MockReceiptContent | null> {
			return receiptContents.find((rc) => rc.receiptId === receiptId) || null;
		},

		async getPurchaseById(id: string): Promise<MockPurchase | null> {
			return purchases.find((p) => p.id === id) || null;
		},

		async getTransactionById(id: string): Promise<MockTransaction | null> {
			return transactions.find((t) => t.id === id) || null;
		},

		async updateTransaction(
			id: string,
			updates: Partial<MockTransaction>,
		): Promise<MockTransaction | null> {
			const tx = transactions.find((t) => t.id === id);
			if (tx) {
				Object.assign(tx, updates);
				updateLogs.push({ type: "transaction", id, updates });
			}
			return tx || null;
		},

		async updatePurchase(
			id: string,
			updates: Partial<MockPurchase>,
		): Promise<MockPurchase | null> {
			const p = purchases.find((p) => p.id === id);
			if (p) {
				Object.assign(p, updates);
				updateLogs.push({ type: "reimbursement", id, updates });
			}
			return p || null;
		},

		addReceipt(
			receipt: Partial<MockReceipt> & { id: string },
			content?: Partial<MockReceiptContent>,
		) {
			receipts.push({
				name: "Test Receipt",
				createdBy: null,
				...receipt,
			});
			if (content) {
				receiptContents.push({
					id: `rc-${receipt.id}`,
					receiptId: receipt.id,
					purchaseDate: null,
					totalAmount: null,
					storeName: null,
					currency: "EUR",
					items: "[]",
					...content,
				});
			}
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

		removeRelationship(
			relationAType: RelationshipEntityType,
			relationId: string,
			relationBType: RelationshipEntityType,
			relationBId: string,
		) {
			const idx = relationships.findIndex(
				(r) =>
					(r.relationAType === relationAType &&
						r.relationId === relationId &&
						r.relationBType === relationBType &&
						r.relationBId === relationBId) ||
					(r.relationAType === relationBType &&
						r.relationId === relationBId &&
						r.relationBType === relationAType &&
						r.relationBId === relationId),
			);
			if (idx !== -1) {
				relationships.splice(idx, 1);
			}
		},

		clear() {
			relationships.length = 0;
			receipts.length = 0;
			receiptContents.length = 0;
			purchases.length = 0;
			transactions.length = 0;
			updateLogs.length = 0;
		},
	};
}

type MockDb = ReturnType<typeof createMockDatabase>;

async function propagateContextToLinkedEntities(
	db: MockDb,
	sourceEntityType: RelationshipEntityType,
	sourceEntityId: string,
	context: RelationshipContextValues,
): Promise<void> {
	const relationships = await db.getEntityRelationships(
		sourceEntityType,
		sourceEntityId,
	);

	for (const rel of relationships) {
		const otherType =
			rel.relationAType === sourceEntityType && rel.relationId === sourceEntityId
				? rel.relationBType
				: rel.relationAType;
		const otherId =
			rel.relationAType === sourceEntityType && rel.relationId === sourceEntityId
				? rel.relationBId
				: rel.relationId;

		if (otherType === "transaction" && shouldOverride(sourceEntityType, "transaction")) {
			await db.updateTransaction(otherId, {
				amount: context.totalAmount ? -context.totalAmount : null,
				date: context.date,
				description: context.description,
				category: context.category,
			});
		} else if (otherType === "reimbursement" && shouldOverride(sourceEntityType, "reimbursement")) {
			await db.updatePurchase(otherId, {
				amount: context.totalAmount,
				description: context.description,
			});
		}
	}
}

describe("Value Propagation - When Linking Entities", () => {
	let db: MockDb;

	beforeEach(() => {
		db = createMockDatabase();
	});

	afterEach(() => {
		db.clear();
	});

	describe("linking receipt to transaction", () => {
		it("should update transaction values when receipt is linked", async () => {
			db.addTransaction({
				id: "tx-1",
				amount: -45.0,
				description: "K-MARKET 1234",
				date: new Date("2024-03-01"),
			});

			db.addReceipt(
				{ id: "r-1" },
				{
					purchaseDate: new Date("2024-03-01"),
					totalAmount: 50.0,
					storeName: "K-Market Oulu",
				},
			);

			db.addRelationship("receipt", "r-1", "transaction", "tx-1");

			const context = await getRelationshipContext(
				db as any,
				"transaction",
				"tx-1",
			);
			await propagateContextToLinkedEntities(db, "receipt", "r-1", context);

			expect(db.updateLogs).toHaveLength(1);
			expect(db.updateLogs[0].type).toBe("transaction");
			expect(db.updateLogs[0].id).toBe("tx-1");
			expect(db.updateLogs[0].updates.amount).toBe(-50.0);
			expect(db.updateLogs[0].updates.description).toBe("K-Market Oulu");
		});

		it("should not update transaction when linking lower priority entity", async () => {
			db.addTransaction({
				id: "tx-1",
				amount: -100.0,
				description: "Original Description",
				date: new Date("2024-03-01"),
			});

			db.addRelationship("transaction", "tx-1", "receipt", "r-1");

			const context = await getRelationshipContext(db as any, "receipt", "r-1");
			await propagateContextToLinkedEntities(db, "transaction", "tx-1", context);

			expect(db.updateLogs).toHaveLength(0);
		});
	});

	describe("linking receipt to reimbursement", () => {
		it("should update reimbursement values when receipt is linked", async () => {
			db.addPurchase({
				id: "p-1",
				amount: 80.0,
				description: "Snacks for event",
				createdAt: new Date("2024-02-15"),
			});

			db.addReceipt(
				{ id: "r-1" },
				{
					purchaseDate: new Date("2024-02-15"),
					totalAmount: 75.5,
					storeName: "S-Market",
				},
			);

			db.addRelationship("receipt", "r-1", "reimbursement", "p-1");

			const context = await getRelationshipContext(
				db as any,
				"reimbursement",
				"p-1",
			);
			await propagateContextToLinkedEntities(db, "receipt", "r-1", context);

			expect(db.updateLogs).toHaveLength(1);
			expect(db.updateLogs[0].type).toBe("reimbursement");
			expect(db.updateLogs[0].id).toBe("p-1");
			expect(db.updateLogs[0].updates.amount).toBe(75.5);
			expect(db.updateLogs[0].updates.description).toBe("S-Market");
		});
	});

	describe("linking reimbursement to transaction", () => {
		it("should update transaction values when reimbursement is linked", async () => {
			db.addTransaction({
				id: "tx-1",
				amount: -50.0,
				description: "BANK TX 123",
				date: new Date("2024-01-10"),
			});

			db.addPurchase({
				id: "p-1",
				amount: 45.0,
				description: "Team lunch",
				createdAt: new Date("2024-01-10"),
			});

			db.addRelationship("reimbursement", "p-1", "transaction", "tx-1");

			const context = await getRelationshipContext(
				db as any,
				"transaction",
				"tx-1",
			);
			await propagateContextToLinkedEntities(
				db,
				"reimbursement",
				"p-1",
				context,
			);

			expect(db.updateLogs).toHaveLength(1);
			expect(db.updateLogs[0].type).toBe("transaction");
			expect(db.updateLogs[0].updates.amount).toBe(-45.0);
			expect(db.updateLogs[0].updates.description).toBe("Team lunch");
		});
	});
});

describe("Value Propagation - When Unlinking Entities", () => {
	let db: MockDb;

	beforeEach(() => {
		db = createMockDatabase();
	});

	afterEach(() => {
		db.clear();
	});

	it("context recalculates when higher priority source is unlinked", async () => {
		db.addReceipt(
			{ id: "r-1" },
			{
				purchaseDate: new Date("2024-01-01"),
				totalAmount: 100.0,
				storeName: "Receipt Store",
			},
		);
		db.addPurchase({
			id: "p-1",
			amount: 90.0,
			description: "Reimbursement Desc",
			createdAt: new Date("2024-01-02"),
		});

		db.addRelationship("receipt", "r-1", "transaction", "tx-1");
		db.addRelationship("reimbursement", "p-1", "transaction", "tx-1");

		const contextWithReceipt = await getRelationshipContext(
			db as any,
			"transaction",
			"tx-1",
		);
		expect(contextWithReceipt.valueSource).toBe("receipt");
		expect(contextWithReceipt.totalAmount).toBe(100.0);

		db.removeRelationship("receipt", "r-1", "transaction", "tx-1");

		const contextAfterUnlink = await getRelationshipContext(
			db as any,
			"transaction",
			"tx-1",
		);
		expect(contextAfterUnlink.valueSource).toBe("reimbursement");
		expect(contextAfterUnlink.totalAmount).toBe(90.0);
	});

	it("context becomes empty when all sources are unlinked", async () => {
		db.addReceipt(
			{ id: "r-1" },
			{
				purchaseDate: new Date(),
				totalAmount: 50.0,
				storeName: "Store",
			},
		);
		db.addRelationship("receipt", "r-1", "transaction", "tx-1");

		db.removeRelationship("receipt", "r-1", "transaction", "tx-1");

		const context = await getRelationshipContext(
			db as any,
			"transaction",
			"tx-1",
		);
		expect(context.valueSource).toBeNull();
		expect(context.totalAmount).toBeNull();
	});
});

describe("Value Propagation - Direct Links Only", () => {
	let db: MockDb;

	beforeEach(() => {
		db = createMockDatabase();
	});

	afterEach(() => {
		db.clear();
	});

	it("propagation only affects directly linked entities", async () => {
		db.addReceipt(
			{ id: "r-1" },
			{
				purchaseDate: new Date(),
				totalAmount: 100.0,
				storeName: "Receipt Store",
			},
		);
		db.addTransaction({
			id: "tx-1",
			amount: -80.0,
			description: "Original TX",
			date: new Date(),
		});
		db.addPurchase({
			id: "p-1",
			amount: 90.0,
			description: "Original Purchase",
			createdAt: new Date(),
		});

		db.addRelationship("receipt", "r-1", "transaction", "tx-1");
		db.addRelationship("transaction", "tx-1", "reimbursement", "p-1");

		const context = await getRelationshipContext(db as any, "receipt", "r-1");
		await propagateContextToLinkedEntities(db, "receipt", "r-1", context);

		const transactionUpdates = db.updateLogs.filter(
			(l) => l.type === "transaction",
		);
		expect(transactionUpdates).toHaveLength(1);
		expect(transactionUpdates[0].id).toBe("tx-1");

		const reimbursementUpdates = db.updateLogs.filter(
			(l) => l.type === "reimbursement",
		);
		expect(reimbursementUpdates).toHaveLength(0);
	});

	it("entity not directly linked to source does not get propagated values", async () => {
		db.addReceipt(
			{ id: "r-1" },
			{
				purchaseDate: new Date(),
				totalAmount: 200.0,
				storeName: "High Priority Receipt",
			},
		);
		db.addPurchase({
			id: "p-1",
			amount: 150.0,
			description: "Medium Priority Reimbursement",
			createdAt: new Date(),
		});
		db.addTransaction({
			id: "tx-1",
			amount: 100.0,
			description: "Transaction",
			date: new Date(),
		});

		db.addRelationship("receipt", "r-1", "transaction", "tx-1");
		db.addRelationship("reimbursement", "p-1", "transaction", "tx-1");

		const receiptContext = await getRelationshipContext(
			db as any,
			"receipt",
			"r-1",
		);
		const reimbursementContext = await getRelationshipContext(
			db as any,
			"reimbursement",
			"p-1",
		);
		const transactionContext = await getRelationshipContext(
			db as any,
			"transaction",
			"tx-1",
		);

		expect(receiptContext.totalAmount).toBe(100.0);
		expect(receiptContext.valueSource).toBe("transaction");

		expect(reimbursementContext.totalAmount).toBe(100.0);
		expect(reimbursementContext.valueSource).toBe("transaction");

		expect(transactionContext.totalAmount).toBe(200.0);
		expect(transactionContext.valueSource).toBe("receipt");
	});
});

describe("Value Propagation - Manual Overrides", () => {
	let db: MockDb;

	beforeEach(() => {
		db = createMockDatabase();
	});

	afterEach(() => {
		db.clear();
	});

	it("manual overrides should set valueSource to manual", async () => {
		db.addReceipt(
			{ id: "r-1" },
			{
				purchaseDate: new Date(),
				totalAmount: 100.0,
				storeName: "Original Store",
			},
		);
		db.addRelationship("receipt", "r-1", "transaction", "tx-1");

		const contextWithManual = await getRelationshipContext(
			db as any,
			"transaction",
			"tx-1",
			{ description: "My Custom Description" },
		);

		expect(contextWithManual.valueSource).toBe("manual");
		expect(contextWithManual.description).toBe("My Custom Description");
		expect(contextWithManual.totalAmount).toBe(100.0);
	});

	it("manual overrides apply even when no linked entities", async () => {
		const context = await getRelationshipContext(
			db as any,
			"transaction",
			null,
			{
				description: "Manual Description",
				totalAmount: 99.99,
				date: new Date("2024-12-25"),
			},
		);

		expect(context.valueSource).toBe("manual");
		expect(context.description).toBe("Manual Description");
		expect(context.totalAmount).toBe(99.99);
	});
});
