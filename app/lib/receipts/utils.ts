const RECEIPT_PREFIX = "receipts";

export function getReceiptsPrefix(): string {
	return `${RECEIPT_PREFIX}/`;
}

export function sanitizeReceiptDescription(description: string): string {
	return description
		.toLowerCase()
		.replace(/[^a-z0-9]/gi, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "")
		.substring(0, 50);
}

export function buildReceiptFilename(
	originalName: string,
	description: string,
	date = new Date(),
): string {
	const dateStamp = date.toISOString().split("T")[0];
	const ext = originalName.split(".").pop() || "pdf";
	const safeDescription = sanitizeReceiptDescription(description || "kuitti") ||
		"kuitti";
	return `${dateStamp}_kuitti_${safeDescription}.${ext}`;
}

export function buildReceiptPath(
	year: string,
	originalName: string,
	description: string,
	date = new Date(),
): string {
	const filename = buildReceiptFilename(originalName, description, date);
	return `${RECEIPT_PREFIX}/${year}/${filename}`;
}
