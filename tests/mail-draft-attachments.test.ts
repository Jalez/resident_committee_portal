import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDraftAttachmentState } from "~/lib/mail-draft-attachments";
import { resolveMailDraftAttachments } from "~/lib/mail-draft-attachments.server";

vi.mock("~/lib/email.server", () => ({
	buildMinutesAttachment: vi.fn(async (id: string) => ({
		name: `minute-${id}.pdf`,
		type: "application/pdf",
		content: "minute-base64",
	})),
	buildReceiptAttachments: vi.fn(async (links: Array<{ id: string }>) =>
		links.map((link) => ({
			name: `receipt-${link.id}.pdf`,
			type: "application/pdf",
			content: "receipt-base64",
		})),
	),
}));

describe("mail draft attachments", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("parses malformed json safely", () => {
		expect(parseDraftAttachmentState("{" as string)).toEqual({
			manualAttachments: [],
			excludedRelationAttachmentKeys: [],
		});
	});

	it("resolves relation and manual attachments with exclusions", async () => {
		const originalFetch = globalThis.fetch;
		(globalThis as any).fetch = vi.fn(async () => ({
			ok: true,
			arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
		}));
		try {
			const result = await resolveMailDraftAttachments({
				db: {
					getReceiptById: async () => ({
						id: "r1",
						pathname: "receipts/2026/r1.pdf",
						name: "R1",
					}),
				} as any,
				requestOrigin: "https://example.com",
				linkedMinutes: [{ id: "m1", title: "Minute" }],
				linkedReceipts: [{ id: "r1" }],
				draftAttachmentState: {
					manualAttachments: [
						{
							id: "manual1",
							name: "local.txt",
							contentType: "text/plain",
							url: "https://example.com/local.txt",
							pathname: "mail/attachments/2026/local.txt",
							size: 12,
							uploadedAt: new Date().toISOString(),
						},
					],
					excludedRelationAttachmentKeys: ["minute:m1"],
				},
			});

			expect(result.includedRelationAttachmentKeys).toEqual(["receipt:r1"]);
			expect(result.attachments.length).toBe(2);
		} finally {
			(globalThis as any).fetch = originalFetch;
		}
	});
});
