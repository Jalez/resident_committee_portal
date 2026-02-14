import { describe, expect, it } from "vitest";

import {
	decodeRelationshipContext,
	encodeRelationshipContext,
	getRelationshipContextFromUrl,
	type SourceContext,
} from "~/lib/linking/relationship-context";
import type { RelationshipContextValues } from "~/lib/relationships/relationship-context.server";

function computeContextStatus(
	context: RelationshipContextValues | null,
	currentEntityValue?: {
		amount?: number | null;
		description?: string | null;
		date?: Date | null;
	},
	entityType?: "receipt" | "reimbursement" | "transaction",
): {
	status: "synced" | "diverged" | "source" | "none";
	amountMismatch: boolean;
} {
	if (!context) {
		return { status: "none", amountMismatch: false };
	}

	const amountMismatch =
		context.totalAmount !== null &&
		currentEntityValue?.amount !== undefined &&
		Math.abs((context.totalAmount || 0) - (currentEntityValue.amount || 0)) >
			0.01;

	const isSource = context.valueSource === entityType;

	let status: "synced" | "diverged" | "source" = "synced";
	if (isSource) status = "source";
	else if (amountMismatch) status = "diverged";

	return { status, amountMismatch };
}

describe("Relationship Context - URL Encoding/Decoding", () => {
	describe("encodeRelationshipContext", () => {
		it("encodes basic context without name", () => {
			const context: SourceContext = {
				type: "receipt",
				id: "r-123",
			};

			const result = encodeRelationshipContext(context);

			expect(result).toBe("receipt:r-123");
		});

		it("encodes context with name", () => {
			const context: SourceContext = {
				type: "transaction",
				id: "tx-456",
				name: "K-Market Purchase",
			};

			const result = encodeRelationshipContext(context);

			expect(result).toBe("transaction:tx-456:K-Market%20Purchase");
		});

		it("encodes context with special characters in name", () => {
			const context: SourceContext = {
				type: "reimbursement",
				id: "p-789",
				name: "Lunch @ Café Møller",
			};

			const result = encodeRelationshipContext(context);

			expect(result).toBe(
				"reimbursement:p-789:Lunch%20%40%20Caf%C3%A9%20M%C3%B8ller",
			);
		});

		it("encodes all entity types correctly", () => {
			const types: Array<SourceContext["type"]> = [
				"receipt",
				"transaction",
				"reimbursement",
				"budget",
				"inventory",
				"minute",
				"news",
				"event",
			];

			for (const type of types) {
				const context: SourceContext = { type, id: "test-id" };
				const result = encodeRelationshipContext(context);
				expect(result).toBe(`${type}:test-id`);
			}
		});
	});

	describe("decodeRelationshipContext", () => {
		it("decodes basic context without name", () => {
			const result = decodeRelationshipContext("receipt:r-123");

			expect(result).toEqual({
				type: "receipt",
				id: "r-123",
				name: undefined,
			});
		});

		it("decodes context with name", () => {
			const result = decodeRelationshipContext(
				"transaction:tx-456:K-Market%20Purchase",
			);

			expect(result).toEqual({
				type: "transaction",
				id: "tx-456",
				name: "K-Market Purchase",
			});
		});

		it("decodes context with special characters in name", () => {
			const result = decodeRelationshipContext(
				"reimbursement:p-789:Lunch%20%40%20Caf%C3%A9%20M%C3%B8ller",
			);

			expect(result).toEqual({
				type: "reimbursement",
				id: "p-789",
				name: "Lunch @ Café Møller",
			});
		});

		it("returns null for null input", () => {
			const result = decodeRelationshipContext(null);

			expect(result).toBeNull();
		});

		it("returns null for empty string", () => {
			const result = decodeRelationshipContext("");

			expect(result).toBeNull();
		});

		it("returns null for single part string", () => {
			const result = decodeRelationshipContext("receipt");

			expect(result).toBeNull();
		});
	});

	describe("round-trip encoding/decoding", () => {
		it("preserves context without name through round-trip", () => {
			const original: SourceContext = {
				type: "receipt",
				id: "r-test-123",
			};

			const encoded = encodeRelationshipContext(original);
			const decoded = decodeRelationshipContext(encoded);

			expect(decoded).toEqual(original);
		});

		it("preserves context with name through round-trip", () => {
			const original: SourceContext = {
				type: "transaction",
				id: "tx-test-456",
				name: "Test Transaction Name",
			};

			const encoded = encodeRelationshipContext(original);
			const decoded = decodeRelationshipContext(encoded);

			expect(decoded).toEqual(original);
		});

		it("preserves context with unicode characters through round-trip", () => {
			const original: SourceContext = {
				type: "reimbursement",
				id: "p-unicode-789",
				name: "购买办公用品 / Офисные товары",
			};

			const encoded = encodeRelationshipContext(original);
			const decoded = decodeRelationshipContext(encoded);

			expect(decoded).toEqual(original);
		});

		it("preserves context with emojis through round-trip", () => {
			const original: SourceContext = {
				type: "receipt",
				id: "r-emoji",
				name: "Shopping 🛒 Party 🎉",
			};

			const encoded = encodeRelationshipContext(original);
			const decoded = decodeRelationshipContext(encoded);

			expect(decoded).toEqual(original);
		});
	});

	describe("getRelationshipContextFromUrl", () => {
		it("extracts context from URL with source parameter", () => {
			const url = new URL("https://example.com/edit?source=receipt:r-123");

			const result = getRelationshipContextFromUrl(url);

			expect(result).toEqual({
				type: "receipt",
				id: "r-123",
				name: undefined,
			});
		});

		it("extracts context from URL with source parameter and name", () => {
			const url = new URL(
				"https://example.com/edit?source=transaction:tx-456:My%20Transaction",
			);

			const result = getRelationshipContextFromUrl(url);

			expect(result).toEqual({
				type: "transaction",
				id: "tx-456",
				name: "My Transaction",
			});
		});

		it("returns null when source parameter is missing", () => {
			const url = new URL("https://example.com/edit?other=param");

			const result = getRelationshipContextFromUrl(url);

			expect(result).toBeNull();
		});

		it("returns null when source parameter is empty", () => {
			const url = new URL("https://example.com/edit?source=");

			const result = getRelationshipContextFromUrl(url);

			expect(result).toBeNull();
		});

		it("handles multiple URL parameters", () => {
			const url = new URL(
				"https://example.com/edit?returnUrl=%2Flist&source=receipt:r-789&mode=edit",
			);

			const result = getRelationshipContextFromUrl(url);

			expect(result).toEqual({
				type: "receipt",
				id: "r-789",
				name: undefined,
			});
		});
	});
});

describe("Relationship Context Status Component Logic", () => {
	describe("status determination", () => {
		it("returns 'none' when context is null", () => {
			const result = computeContextStatus(null);

			expect(result.status).toBe("none");
			expect(result.amountMismatch).toBe(false);
		});

		it("returns 'source' when entity type matches valueSource", () => {
			const context: RelationshipContextValues = {
				date: new Date("2024-01-01"),
				totalAmount: 100.0,
				description: "Test",
				currency: "EUR",
				category: null,
				purchaserId: null,
				lineItems: [],
				valueSource: "receipt",
			};

			const result = computeContextStatus(
				context,
				{ amount: 100.0 },
				"receipt",
			);

			expect(result.status).toBe("source");
			expect(result.amountMismatch).toBe(false);
		});

		it("returns 'synced' when values match and entity is not source", () => {
			const context: RelationshipContextValues = {
				date: new Date("2024-01-01"),
				totalAmount: 50.0,
				description: "Test",
				currency: "EUR",
				category: null,
				purchaserId: null,
				lineItems: [],
				valueSource: "receipt",
			};

			const result = computeContextStatus(
				context,
				{ amount: 50.0 },
				"transaction",
			);

			expect(result.status).toBe("synced");
			expect(result.amountMismatch).toBe(false);
		});

		it("returns 'diverged' when amount does not match", () => {
			const context: RelationshipContextValues = {
				date: new Date("2024-01-01"),
				totalAmount: 100.0,
				description: "Test",
				currency: "EUR",
				category: null,
				purchaserId: null,
				lineItems: [],
				valueSource: "receipt",
			};

			const result = computeContextStatus(
				context,
				{ amount: 75.0 },
				"transaction",
			);

			expect(result.status).toBe("diverged");
			expect(result.amountMismatch).toBe(true);
		});

		it("returns 'source' even when amount mismatches (source wins)", () => {
			const context: RelationshipContextValues = {
				date: new Date("2024-01-01"),
				totalAmount: 100.0,
				description: "Test",
				currency: "EUR",
				category: null,
				purchaserId: null,
				lineItems: [],
				valueSource: "receipt",
			};

			const result = computeContextStatus(context, { amount: 50.0 }, "receipt");

			expect(result.status).toBe("source");
			expect(result.amountMismatch).toBe(true);
		});
	});

	describe("amount mismatch detection", () => {
		it("detects mismatch when amounts differ by more than 0.01", () => {
			const context: RelationshipContextValues = {
				date: null,
				totalAmount: 100.0,
				description: null,
				currency: "EUR",
				category: null,
				purchaserId: null,
				lineItems: [],
				valueSource: "receipt",
			};

			const result = computeContextStatus(
				context,
				{ amount: 99.98 },
				"transaction",
			);
			expect(result.amountMismatch).toBe(true);
		});

		it("does not detect mismatch when amounts differ by less than 0.01", () => {
			const context: RelationshipContextValues = {
				date: null,
				totalAmount: 100.0,
				description: null,
				currency: "EUR",
				category: null,
				purchaserId: null,
				lineItems: [],
				valueSource: "receipt",
			};

			const result = computeContextStatus(
				context,
				{ amount: 99.991 },
				"transaction",
			);
			expect(result.amountMismatch).toBe(false);
		});

		it("does not detect mismatch when amounts are exactly equal", () => {
			const context: RelationshipContextValues = {
				date: null,
				totalAmount: 123.45,
				description: null,
				currency: "EUR",
				category: null,
				purchaserId: null,
				lineItems: [],
				valueSource: "reimbursement",
			};

			const result = computeContextStatus(
				context,
				{ amount: 123.45 },
				"transaction",
			);
			expect(result.amountMismatch).toBe(false);
		});

		it("handles null context totalAmount", () => {
			const context: RelationshipContextValues = {
				date: null,
				totalAmount: null,
				description: null,
				currency: "EUR",
				category: null,
				purchaserId: null,
				lineItems: [],
				valueSource: "transaction",
			};

			const result = computeContextStatus(
				context,
				{ amount: 100.0 },
				"receipt",
			);
			expect(result.amountMismatch).toBe(false);
		});

		it("handles undefined current entity amount", () => {
			const context: RelationshipContextValues = {
				date: null,
				totalAmount: 100.0,
				description: null,
				currency: "EUR",
				category: null,
				purchaserId: null,
				lineItems: [],
				valueSource: "receipt",
			};

			const result = computeContextStatus(context, {}, "transaction");
			expect(result.amountMismatch).toBe(false);
		});
	});

	describe("entity type matching", () => {
		it("matches receipt entity type", () => {
			const context: RelationshipContextValues = {
				date: null,
				totalAmount: null,
				description: null,
				currency: "EUR",
				category: null,
				purchaserId: null,
				lineItems: [],
				valueSource: "receipt",
			};

			expect(computeContextStatus(context, {}, "receipt").status).toBe(
				"source",
			);
			expect(computeContextStatus(context, {}, "transaction").status).toBe(
				"synced",
			);
			expect(computeContextStatus(context, {}, "reimbursement").status).toBe(
				"synced",
			);
		});

		it("matches reimbursement entity type", () => {
			const context: RelationshipContextValues = {
				date: null,
				totalAmount: null,
				description: null,
				currency: "EUR",
				category: null,
				purchaserId: null,
				lineItems: [],
				valueSource: "reimbursement",
			};

			expect(computeContextStatus(context, {}, "reimbursement").status).toBe(
				"source",
			);
			expect(computeContextStatus(context, {}, "receipt").status).toBe(
				"synced",
			);
			expect(computeContextStatus(context, {}, "transaction").status).toBe(
				"synced",
			);
		});

		it("matches transaction entity type", () => {
			const context: RelationshipContextValues = {
				date: null,
				totalAmount: null,
				description: null,
				currency: "EUR",
				category: null,
				purchaserId: null,
				lineItems: [],
				valueSource: "transaction",
			};

			expect(computeContextStatus(context, {}, "transaction").status).toBe(
				"source",
			);
			expect(computeContextStatus(context, {}, "receipt").status).toBe(
				"synced",
			);
			expect(computeContextStatus(context, {}, "reimbursement").status).toBe(
				"synced",
			);
		});

		it("handles manual valueSource (no entity matches)", () => {
			const context: RelationshipContextValues = {
				date: null,
				totalAmount: 100.0,
				description: null,
				currency: "EUR",
				category: null,
				purchaserId: null,
				lineItems: [],
				valueSource: "manual",
			};

			expect(computeContextStatus(context, {}, "receipt").status).toBe(
				"synced",
			);
			expect(computeContextStatus(context, {}, "transaction").status).toBe(
				"synced",
			);
			expect(computeContextStatus(context, {}, "reimbursement").status).toBe(
				"synced",
			);
		});
	});
});
