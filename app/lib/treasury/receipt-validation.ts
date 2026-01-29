export type ReceiptLink = {
	id: string;
	name: string;
	url: string;
};

export const MISSING_RECEIPTS_ERROR = "Receipt selection is required";
export const RECEIPTS_SECTION_ID = "reimbursement-receipts-section";

export function parseReceiptLinks(formData: FormData): ReceiptLink[] {
	const receiptLinksJson = formData.get("receiptLinks") as string;
	try {
		return receiptLinksJson ? (JSON.parse(receiptLinksJson) as ReceiptLink[]) : [];
	} catch {
		return [];
	}
}

export function hasRequiredReceipts(
	receiptLinks: ReceiptLink[],
	required: boolean,
): boolean {
	return !required || receiptLinks.length > 0;
}

export function getMissingReceiptsError(
	receiptLinks: ReceiptLink[],
	required: boolean,
): string | null {
	return hasRequiredReceipts(receiptLinks, required)
		? null
		: MISSING_RECEIPTS_ERROR;
}
