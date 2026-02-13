import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	extractPurchaseIdFromSubject,
	parseReimbursementReply,
} from "../app/lib/email.server";
import { ENTITY_DEFINITIONS } from "../app/lib/entity-definitions";
import { validateRequiredRelationships } from "../app/lib/required-relationships";

vi.mock("../app/lib/openrouter.server", () => ({
	isAIParsingEnabled: async () => ({ enabled: false }),
	parseReplyWithAI: async () => "unclear" as const,
	getKeywords: async () => ({
		approval: ["approved", "good", "ok", "yes"],
		rejection: ["rejected", "denied", "no", "declined"],
	}),
}));

function createMockDatabase() {
	const relationships: Array<{
		relationAType: string;
		relationId: string;
		relationBType: string;
		relationBId: string;
	}> = [];
	const entities: Map<string, any> = new Map();
	const mailMessages: Map<string, any> = new Map();

	return {
		relationships,
		entities,
		mailMessages,

		async createEntityRelationship(data: {
			relationAType: string;
			relationId: string;
			relationBType: string;
			relationBId: string;
			createdBy?: string | null;
		}) {
			relationships.push({
				relationAType: data.relationAType,
				relationId: data.relationId,
				relationBType: data.relationBType,
				relationBId: data.relationBId,
			});
			return data;
		},

		async getEntityRelationships(type: string, id: string) {
			return relationships.filter(
				(rel) =>
					(rel.relationAType === type && rel.relationId === id) ||
					(rel.relationBType === type && rel.relationBId === id),
			);
		},

		async insertCommitteeMailMessage(data: any) {
			const id = `mail-${Date.now()}-${Math.random().toString(36).slice(2)}`;
			const message = { id, ...data };
			mailMessages.set(id, message);
			if (data.messageId) {
				mailMessages.set(data.messageId, message);
			}
			return message;
		},

		async getCommitteeMailMessageByMessageId(messageId: string) {
			return mailMessages.get(messageId) || null;
		},

		async getPurchaseById(id: string) {
			return entities.get(id) || null;
		},

		async updatePurchase(id: string, data: any) {
			const existing = entities.get(id);
			if (existing) {
				entities.set(id, { ...existing, ...data });
			}
		},

		async createPurchase(data: any) {
			const id = data.id || `purchase-${Date.now()}`;
			const entity = { id, ...data };
			entities.set(id, entity);
			return entity;
		},

		async createReceipt(data: any) {
			const id = data.id || `receipt-${Date.now()}`;
			const entity = { id, ...data, __type: "receipt" };
			entities.set(id, entity);
			return entity;
		},

		async createTransaction(data: any) {
			const id = data.id || `transaction-${Date.now()}`;
			const entity = { id, ...data, __type: "transaction" };
			entities.set(id, entity);
			return entity;
		},

		async createMinute(data: any) {
			const id = data.id || `minute-${Date.now()}`;
			const entity = { id, ...data, __type: "minute" };
			entities.set(id, entity);
			return entity;
		},

		getEntityById(type: string, id: string) {
			return entities.get(id) || null;
		},

		clear() {
			relationships.length = 0;
			entities.clear();
			mailMessages.clear();
		},
	};
}

type MockDb = ReturnType<typeof createMockDatabase>;

async function simulateSendReimbursementRequest(
	db: MockDb,
	purchaseId: string,
	mockEmailResult: { success: boolean; messageId?: string; error?: string },
) {
	const purchase = await db.getPurchaseById(purchaseId);
	if (!purchase) {
		return { success: false, error: "Purchase not found" };
	}

	const allRelationships = await db.getEntityRelationships(
		"reimbursement",
		purchase.id,
	);

	const relationshipsForValidation: Record<string, { linked: any[] }> = {};
	for (const rel of allRelationships) {
		let linkedType: string | null = null;
		let linkedId: string | null = null;

		if (
			rel.relationAType === "reimbursement" &&
			rel.relationId === purchase.id
		) {
			linkedType = rel.relationBType;
			linkedId = rel.relationBId;
		} else if (
			rel.relationBType === "reimbursement" &&
			rel.relationBId === purchase.id
		) {
			linkedType = rel.relationAType;
			linkedId = rel.relationId;
		}

		if (linkedType && linkedId) {
			if (!relationshipsForValidation[linkedType]) {
				relationshipsForValidation[linkedType] = { linked: [] };
			}
			relationshipsForValidation[linkedType].linked.push({ id: linkedId });
		}
	}

	const validation = validateRequiredRelationships(
		"reimbursement",
		relationshipsForValidation,
	);

	if (!validation.valid) {
		return {
			success: false,
			error: `Missing required relationships: ${validation.missing.map((m) => m.type).join(", ")}`,
		};
	}

	if (!mockEmailResult.success) {
		return { success: false, error: mockEmailResult.error };
	}

	if (mockEmailResult.messageId) {
		await db.updatePurchase(purchase.id, {
			emailSent: true,
			emailMessageId: mockEmailResult.messageId,
		});

		const threadId = `thread-${mockEmailResult.messageId}`;
		await db.insertCommitteeMailMessage({
			direction: "sent",
			messageId: mockEmailResult.messageId,
			threadId,
			subject: `Reimbursement request for ${purchase.description}`,
		});

		const mailMessage = await db.getCommitteeMailMessageByMessageId(
			mockEmailResult.messageId,
		);
		if (mailMessage) {
			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "mail",
				relationBId: mailMessage.id,
				createdBy: null,
			});
		}
	}

	return { success: true, messageId: mockEmailResult.messageId };
}

async function simulateReplyProcessing(
	db: MockDb,
	purchaseId: string,
	decision: "approved" | "rejected" | "unclear",
) {
	const purchase = await db.getPurchaseById(purchaseId);
	if (!purchase) {
		return { success: false, error: "Purchase not found" };
	}

	if (decision === "approved") {
		await db.updatePurchase(purchase.id, {
			status: "approved",
		});

		const allRelationships = await db.getEntityRelationships(
			"reimbursement",
			purchase.id,
		);
		const transactionRel = allRelationships.find(
			(r) =>
				r.relationBType === "transaction" || r.relationAType === "transaction",
		);
		if (transactionRel) {
			const transactionId =
				transactionRel.relationBType === "transaction"
					? transactionRel.relationBId
					: transactionRel.relationId;
			const transaction = db.getEntityById("transaction", transactionId);
			if (transaction) {
				db.entities.set(transactionId, {
					...transaction,
					reimbursementStatus: "approved",
				});
			}
		}
	} else if (decision === "rejected") {
		await db.updatePurchase(purchase.id, {
			status: "rejected",
		});

		const allRelationships = await db.getEntityRelationships(
			"reimbursement",
			purchase.id,
		);
		const transactionRel = allRelationships.find(
			(r) =>
				r.relationBType === "transaction" || r.relationAType === "transaction",
		);
		if (transactionRel) {
			const transactionId =
				transactionRel.relationBType === "transaction"
					? transactionRel.relationBId
					: transactionRel.relationId;
			const transaction = db.getEntityById("transaction", transactionId);
			if (transaction) {
				db.entities.set(transactionId, {
					...transaction,
					reimbursementStatus: "rejected",
				});
			}
		}
	}

	return { success: true };
}

describe("Reimbursement Request Flow", () => {
	let db: MockDb;

	beforeAll(() => {
		db = createMockDatabase();
	});

	afterAll(() => {
		db.clear();
	});

	describe("Required Relationships Validation", () => {
		it("should fail validation when receipt is missing", () => {
			const relationships = {
				transaction: { linked: [{ id: "tx-1" }] },
				minute: { linked: [{ id: "min-1" }] },
			};

			const result = validateRequiredRelationships(
				"reimbursement",
				relationships,
			);

			expect(result.valid).toBe(false);
			expect(result.missing).toHaveLength(1);
			expect(result.missing[0].type).toBe("receipt");
		});

		it("should fail validation when transaction is missing", () => {
			const relationships = {
				receipt: { linked: [{ id: "rc-1" }] },
				minute: { linked: [{ id: "min-1" }] },
			};

			const result = validateRequiredRelationships(
				"reimbursement",
				relationships,
			);

			expect(result.valid).toBe(false);
			expect(result.missing).toHaveLength(1);
			expect(result.missing[0].type).toBe("transaction");
		});

		it("should fail validation when minute is missing", () => {
			const relationships = {
				receipt: { linked: [{ id: "rc-1" }] },
				transaction: { linked: [{ id: "tx-1" }] },
			};

			const result = validateRequiredRelationships(
				"reimbursement",
				relationships,
			);

			expect(result.valid).toBe(false);
			expect(result.missing).toHaveLength(1);
			expect(result.missing[0].type).toBe("minute");
		});

		it("should fail validation when multiple required relationships are missing", () => {
			const relationships = {
				receipt: { linked: [] },
				transaction: { linked: [] },
				minute: { linked: [] },
			};

			const result = validateRequiredRelationships(
				"reimbursement",
				relationships,
			);

			expect(result.valid).toBe(false);
			expect(result.missing).toHaveLength(3);
		});

		it("should pass validation when all required relationships are present", () => {
			const relationships = {
				receipt: { linked: [{ id: "rc-1" }] },
				transaction: { linked: [{ id: "tx-1" }] },
				minute: { linked: [{ id: "min-1" }] },
			};

			const result = validateRequiredRelationships(
				"reimbursement",
				relationships,
			);

			expect(result.valid).toBe(true);
			expect(result.missing).toHaveLength(0);
		});

		it("should have correct required relationships defined in entity definitions", () => {
			const definition = ENTITY_DEFINITIONS.reimbursement;
			expect(definition.requiredRelationships).toBeDefined();
			expect(definition.requiredRelationships).toHaveLength(3);

			const types = definition.requiredRelationships?.map((r) => r.type);
			expect(types).toContain("receipt");
			expect(types).toContain("transaction");
			expect(types).toContain("minute");
		});
	});

	describe("Sending Reimbursement Email", () => {
		beforeEach(() => {
			db.clear();
		});

		it("should prevent sending when required relationships are missing", async () => {
			const purchase = await db.createPurchase({
				id: "purchase-1",
				description: "Test Reimbursement",
				amount: "100.00",
				purchaserName: "John Doe",
				bankAccount: "FI1234567890",
				status: "pending",
			});

			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "receipt",
				relationBId: "receipt-1",
			});

			const result = await simulateSendReimbursementRequest(db, purchase.id, {
				success: true,
				messageId: "msg-123",
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain("transaction");
			expect(result.error).toContain("minute");
		});

		it("should successfully send when all required relationships are present", async () => {
			const purchase = await db.createPurchase({
				id: "purchase-2",
				description: "Complete Reimbursement",
				amount: "50.00",
				purchaserName: "Jane Doe",
				bankAccount: "FI0987654321",
				status: "pending",
			});

			await db.createReceipt({ id: "receipt-2", name: "Test Receipt" });
			await db.createTransaction({
				id: "tx-2",
				description: "Test Transaction",
			});
			await db.createMinute({ id: "min-2", title: "Test Minute" });

			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "receipt",
				relationBId: "receipt-2",
			});
			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "transaction",
				relationBId: "tx-2",
			});
			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "minute",
				relationBId: "min-2",
			});

			const result = await simulateSendReimbursementRequest(db, purchase.id, {
				success: true,
				messageId: "msg-456",
			});

			expect(result.success).toBe(true);
			expect(result.messageId).toBe("msg-456");
		});

		it("should create mail message record after successful send", async () => {
			const purchase = await db.createPurchase({
				id: "purchase-3",
				description: "Email Test",
				amount: "25.00",
				purchaserName: "Test User",
				bankAccount: "FI1111111111",
				status: "pending",
			});

			await db.createReceipt({ id: "receipt-3" });
			await db.createTransaction({ id: "tx-3" });
			await db.createMinute({ id: "min-3" });

			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "receipt",
				relationBId: "receipt-3",
			});
			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "transaction",
				relationBId: "tx-3",
			});
			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "minute",
				relationBId: "min-3",
			});

			await simulateSendReimbursementRequest(db, purchase.id, {
				success: true,
				messageId: "msg-789",
			});

			const mailMessage =
				await db.getCommitteeMailMessageByMessageId("msg-789");
			expect(mailMessage).toBeDefined();
			expect(mailMessage?.direction).toBe("sent");
		});

		it("should create relationship between reimbursement and mail message", async () => {
			const purchase = await db.createPurchase({
				id: "purchase-4",
				description: "Relationship Test",
				amount: "75.00",
				purchaserName: "Another User",
				bankAccount: "FI2222222222",
				status: "pending",
			});

			await db.createReceipt({ id: "receipt-4" });
			await db.createTransaction({ id: "tx-4" });
			await db.createMinute({ id: "min-4" });

			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "receipt",
				relationBId: "receipt-4",
			});
			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "transaction",
				relationBId: "tx-4",
			});
			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "minute",
				relationBId: "min-4",
			});

			await simulateSendReimbursementRequest(db, purchase.id, {
				success: true,
				messageId: "msg-rel-test",
			});

			const allRelationships = await db.getEntityRelationships(
				"reimbursement",
				purchase.id,
			);
			const mailRelationship = allRelationships.find(
				(r) => r.relationBType === "mail" || r.relationAType === "mail",
			);

			expect(mailRelationship).toBeDefined();
			expect(mailRelationship?.relationBType).toBe("mail");
		});

		it("should update purchase with emailSent flag after successful send", async () => {
			const purchase = await db.createPurchase({
				id: "purchase-5",
				description: "Flag Test",
				amount: "30.00",
				purchaserName: "Flag User",
				bankAccount: "FI3333333333",
				status: "pending",
			});

			await db.createReceipt({ id: "receipt-5" });
			await db.createTransaction({ id: "tx-5" });
			await db.createMinute({ id: "min-5" });

			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "receipt",
				relationBId: "receipt-5",
			});
			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "transaction",
				relationBId: "tx-5",
			});
			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "minute",
				relationBId: "min-5",
			});

			await simulateSendReimbursementRequest(db, purchase.id, {
				success: true,
				messageId: "msg-flag-test",
			});

			const updatedPurchase = await db.getPurchaseById(purchase.id);
			expect(updatedPurchase?.emailSent).toBe(true);
			expect(updatedPurchase?.emailMessageId).toBe("msg-flag-test");
		});
	});

	describe("Email Reply Parsing", () => {
		it("should extract purchase ID from tagged subject", () => {
			const purchaseId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
			const subject = `[Reimbursement ${purchaseId}] Test Subject`;

			const extracted = extractPurchaseIdFromSubject(subject);

			expect(extracted).toBe(purchaseId);
		});

		it("should return null for subjects without purchase ID", () => {
			const subject = "Regular email subject";

			const extracted = extractPurchaseIdFromSubject(subject);

			expect(extracted).toBeNull();
		});

		it("should parse approved keywords correctly", async () => {
			const approvedContent = "This request has been approved. Please proceed.";
			const result = await parseReimbursementReply(approvedContent);

			expect(result).toBe("approved");
		});

		it("should parse rejected keywords correctly", async () => {
			const rejectedContent =
				"This request has been rejected due to missing information.";
			const result = await parseReimbursementReply(rejectedContent);

			expect(result).toBe("rejected");
		});

		it("should return unclear for ambiguous content", async () => {
			const unclearContent =
				"Thank you for your submission. We will review it.";
			const result = await parseReimbursementReply(unclearContent);

			expect(result).toBe("unclear");
		});
	});

	describe("Status Update Propagation", () => {
		beforeEach(() => {
			db.clear();
		});

		it("should update reimbursement status when approved", async () => {
			const purchase = await db.createPurchase({
				id: "purchase-approve",
				description: "Approval Test",
				amount: "100.00",
				purchaserName: "Approve User",
				bankAccount: "FI4444444444",
				status: "pending",
			});

			await simulateReplyProcessing(db, purchase.id, "approved");

			const updatedPurchase = await db.getPurchaseById(purchase.id);
			expect(updatedPurchase?.status).toBe("approved");
		});

		it("should update reimbursement status when rejected", async () => {
			const purchase = await db.createPurchase({
				id: "purchase-reject",
				description: "Rejection Test",
				amount: "200.00",
				purchaserName: "Reject User",
				bankAccount: "FI5555555555",
				status: "pending",
			});

			await simulateReplyProcessing(db, purchase.id, "rejected");

			const updatedPurchase = await db.getPurchaseById(purchase.id);
			expect(updatedPurchase?.status).toBe("rejected");
		});

		it("should propagate approval status to linked transaction", async () => {
			const transaction = await db.createTransaction({
				id: "tx-propagate",
				description: "Propagation Test",
				amount: "150.00",
				status: "pending",
			});

			const purchase = await db.createPurchase({
				id: "purchase-propagate",
				description: "Propagation Test",
				amount: "150.00",
				purchaserName: "Prop User",
				bankAccount: "FI6666666666",
				status: "pending",
			});

			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "transaction",
				relationBId: transaction.id,
			});

			await simulateReplyProcessing(db, purchase.id, "approved");

			const updatedTransaction = db.getEntityById(
				"transaction",
				transaction.id,
			);
			expect(updatedTransaction?.reimbursementStatus).toBe("approved");
		});

		it("should propagate rejection status to linked transaction", async () => {
			const transaction = await db.createTransaction({
				id: "tx-reject-prop",
				description: "Reject Propagation Test",
				amount: "175.00",
				status: "pending",
			});

			const purchase = await db.createPurchase({
				id: "purchase-reject-prop",
				description: "Reject Propagation Test",
				amount: "175.00",
				purchaserName: "Reject Prop User",
				bankAccount: "FI7777777777",
				status: "pending",
			});

			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "transaction",
				relationBId: transaction.id,
			});

			await simulateReplyProcessing(db, purchase.id, "rejected");

			const updatedTransaction = db.getEntityById(
				"transaction",
				transaction.id,
			);
			expect(updatedTransaction?.reimbursementStatus).toBe("rejected");
		});

		it("should not change transaction status if not linked", async () => {
			const transaction = await db.createTransaction({
				id: "tx-unlinked",
				description: "Unlinked Transaction",
				amount: "300.00",
				status: "pending",
			});

			const purchase = await db.createPurchase({
				id: "purchase-unlinked",
				description: "Unlinked Purchase",
				amount: "300.00",
				purchaserName: "Unlinked User",
				bankAccount: "FI8888888888",
				status: "pending",
			});

			await simulateReplyProcessing(db, purchase.id, "approved");

			const unchangedTransaction = db.getEntityById(
				"transaction",
				transaction.id,
			);
			expect(unchangedTransaction?.reimbursementStatus).toBeUndefined();
		});
	});

	describe("Complete Flow Integration", () => {
		beforeEach(() => {
			db.clear();
		});

		it("should complete full reimbursement flow", async () => {
			const receipt = await db.createReceipt({
				id: "receipt-full",
				name: "Full Flow Receipt",
			});
			const transaction = await db.createTransaction({
				id: "tx-full",
				description: "Full Flow Transaction",
				amount: "250.00",
				status: "pending",
			});
			const minute = await db.createMinute({
				id: "minute-full",
				title: "Full Flow Minute",
			});

			const purchase = await db.createPurchase({
				id: "purchase-full",
				description: "Full Flow Reimbursement",
				amount: "250.00",
				purchaserName: "Full Flow User",
				bankAccount: "FI9999999999",
				status: "pending",
			});

			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "receipt",
				relationBId: receipt.id,
			});
			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "transaction",
				relationBId: transaction.id,
			});
			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: purchase.id,
				relationBType: "minute",
				relationBId: minute.id,
			});

			const sendResult = await simulateSendReimbursementRequest(
				db,
				purchase.id,
				{
					success: true,
					messageId: "msg-full-flow",
				},
			);
			expect(sendResult.success).toBe(true);

			const sentPurchase = await db.getPurchaseById(purchase.id);
			expect(sentPurchase?.emailSent).toBe(true);

			const mailMessage =
				await db.getCommitteeMailMessageByMessageId("msg-full-flow");
			expect(mailMessage).toBeDefined();

			const allRels = await db.getEntityRelationships(
				"reimbursement",
				purchase.id,
			);
			const mailRel = allRels.find((r) => r.relationBType === "mail");
			expect(mailRel).toBeDefined();

			await simulateReplyProcessing(db, purchase.id, "approved");

			const approvedPurchase = await db.getPurchaseById(purchase.id);
			expect(approvedPurchase?.status).toBe("approved");

			const updatedTransaction = db.getEntityById(
				"transaction",
				transaction.id,
			);
			expect(updatedTransaction?.reimbursementStatus).toBe("approved");
		});
	});
});
