import { z } from "zod";
import { getDatabase, type Receipt } from "~/db/server.server";

const updateReceiptSchema = z.object({
	name: z.string().optional(),
	description: z.string().optional(),
});

export async function saveReceiptOCRContent(
	formData: FormData,
	receipt: Receipt,
) {
	const ocrDataJson = formData.get("ocr_data") as string | null;
	if (!ocrDataJson) return;

	let ocrData: {
		rawText: string;
		parsedData: any;
	} | null = null;

	try {
		ocrData = JSON.parse(ocrDataJson);
	} catch (error) {
		console.error("Failed to parse OCR data:", error);
		return;
	}

	if (!ocrData) return;

	const db = getDatabase();

	try {
		await db.updateReceipt(receipt.id, {
			rawText: ocrData.rawText,
			storeName: ocrData.parsedData?.storeName || null,
			items: ocrData.parsedData?.items
				? JSON.stringify(ocrData.parsedData.items)
				: null,
			totalAmount: ocrData.parsedData?.totalAmount?.toString() || null,
			currency: ocrData.parsedData?.currency || "EUR",
			purchaseDate: ocrData.parsedData?.purchaseDate
				? new Date(ocrData.parsedData.purchaseDate)
				: null,
			aiModel: "OpenRouter via analyze API",
			ocrProcessed: true,
			ocrProcessedAt: new Date(),
		});
	} catch (error) {
		console.error("[Receipt Edit] Failed to save OCR content:", error);
	}
}

export async function deleteReceipt(receiptId: string) {
	const db = getDatabase();
	const _relationships = await db.getEntityRelationships("receipt", receiptId);
	await db.deleteReceipt(receiptId);
}

export { handleFileUpload } from "~/lib/file-upload.server";
