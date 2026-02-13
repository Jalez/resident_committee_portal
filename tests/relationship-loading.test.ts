import { describe, expect, it } from "vitest";

interface EntityRelationship {
	relationAType: string;
	relationId: string;
	relationBType: string;
	relationBId: string;
}

/**
 * Extracts linked entity IDs from relationships.
 * This mirrors the logic from load-relationships.server.ts
 */
function extractLinkedIds(
	allRelationships: EntityRelationship[],
	entityType: string,
	entityId: string,
	relationBType: string,
): string[] {
	return allRelationships
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
}

describe("Relationship Loading Logic", () => {
	const faqId = "faq-123";
	const receiptId = "receipt-456";
	const transactionId = "transaction-789";

	const relationship1: EntityRelationship = {
		relationAType: "faq",
		relationId: faqId,
		relationBType: "receipt",
		relationBId: receiptId,
	};

	const relationship2: EntityRelationship = {
		relationAType: "transaction",
		relationId: transactionId,
		relationBType: "receipt",
		relationBId: receiptId,
	};

	describe("when viewing receipt (relationB in relationships)", () => {
		const allRelationships = [relationship1, relationship2];

		it("should find FAQ as linked (receipt is relationB, FAQ is relationA)", () => {
			const linkedFaqs = extractLinkedIds(
				allRelationships,
				"receipt",
				receiptId,
				"faq",
			);
			expect(linkedFaqs).toEqual([faqId]);
		});

		it("should find Transaction as linked (receipt is relationB, Transaction is relationA)", () => {
			const linkedTransactions = extractLinkedIds(
				allRelationships,
				"receipt",
				receiptId,
				"transaction",
			);
			expect(linkedTransactions).toEqual([transactionId]);
		});
	});

	describe("when viewing FAQ (relationA in relationship)", () => {
		it("should find Receipt as linked (FAQ is relationA, receipt is relationB)", () => {
			const linkedReceipts = extractLinkedIds(
				[relationship1],
				"faq",
				faqId,
				"receipt",
			);
			expect(linkedReceipts).toEqual([receiptId]);
		});
	});

	describe("unrelated entities", () => {
		it("should not find FAQ linked to Transaction", () => {
			const linkedFaqs = extractLinkedIds(
				[relationship1, relationship2],
				"transaction",
				transactionId,
				"faq",
			);
			expect(linkedFaqs).toEqual([]);
		});
	});

	describe("multiple relationships", () => {
		const receipt2Id = "receipt-999";
		const relationship3: EntityRelationship = {
			relationAType: "faq",
			relationId: faqId,
			relationBType: "receipt",
			relationBId: receipt2Id,
		};

		it("should find multiple receipts linked to same FAQ", () => {
			const linkedReceipts = extractLinkedIds(
				[relationship1, relationship3],
				"faq",
				faqId,
				"receipt",
			);
			expect(linkedReceipts.sort()).toEqual([receiptId, receipt2Id].sort());
		});
	});

	describe("bidirectional relationships", () => {
		const budgetId = "budget-111";
		const relationships: EntityRelationship[] = [
			{
				relationAType: "receipt",
				relationId: receiptId,
				relationBType: "transaction",
				relationBId: transactionId,
			},
			{
				relationAType: "budget",
				relationId: budgetId,
				relationBType: "receipt",
				relationBId: receiptId,
			},
		];

		it("should find Transaction (receipt as relationA) and Budget (receipt as relationB)", () => {
			const linkedTransactions = extractLinkedIds(
				relationships,
				"receipt",
				receiptId,
				"transaction",
			);
			const linkedBudgets = extractLinkedIds(
				relationships,
				"receipt",
				receiptId,
				"budget",
			);

			expect(linkedTransactions).toEqual([transactionId]);
			expect(linkedBudgets).toEqual([budgetId]);
		});
	});
});
