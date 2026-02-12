import { z } from "zod";
import { getDatabase, type NewReceiptContent, type Receipt } from "~/db/server";
import {
	RECEIPT_ALLOWED_MIME_TYPES,
	RECEIPT_ALLOWED_TYPES,
} from "~/lib/constants";
import { getReceiptStorage } from "~/lib/receipts/server";
import { buildReceiptPath } from "~/lib/receipts/utils";

const updateReceiptSchema = z.object({
	name: z.string().optional(),
	description: z.string().optional(),
});

type FileUploadResult =
	| {
		nextUrl: string | null;
		nextPathname: string | null;
		nextName: string | null;
	}
	| {
		error: "invalid_file_type";
		allowedTypes: string;
	};

export async function handleFileUpload(
	formData: FormData,
	receipt: Receipt,
	name?: string,
): Promise<FileUploadResult> {
	const file = formData.get("file") as File | null;
	const tempUrl = formData.get("tempUrl") as string | null;
	const tempPathname = formData.get("tempPathname") as string | null;

	const pathnameParts = receipt.pathname?.split("/") || [];
	const year = pathnameParts[1] || new Date().getFullYear().toString();

	let nextUrl = receipt.url || null;
	let nextPathname = receipt.pathname || null;
	let nextName = name?.trim() || receipt.name || null;

	// Use temp file if available
	if (tempUrl && tempPathname) {
		nextUrl = tempUrl;
		nextPathname = tempPathname;
	} else if (file) {
		const fileExt = `.${file.name.split(".").pop()?.toLowerCase()}`;
		if (
			!RECEIPT_ALLOWED_TYPES.includes(
				fileExt as (typeof RECEIPT_ALLOWED_TYPES)[number],
			)
		) {
			return {
				error: "invalid_file_type",
				allowedTypes: RECEIPT_ALLOWED_TYPES.join(", "),
			};
		}
		if (
			!RECEIPT_ALLOWED_MIME_TYPES.includes(
				file.type as (typeof RECEIPT_ALLOWED_MIME_TYPES)[number],
			)
		) {
			return {
				error: "invalid_file_type",
				allowedTypes: RECEIPT_ALLOWED_TYPES.join(", "),
			};
		}

		const pathname = buildReceiptPath(year, file.name, nextName || "kuitti");
		const storage = getReceiptStorage();
		const uploadResult = await storage.uploadFile(pathname, file, {
			access: "public",
			addRandomSuffix: true,
		});
		nextUrl = uploadResult.url;
		nextPathname = uploadResult.pathname;
		if (!name?.trim()) {
			nextName = file.name;
		}
	}

	return { nextUrl, nextPathname, nextName };
}

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
		// Delete existing content first
		const existingContent = await db.getReceiptContentByReceiptId(receipt.id);
		if (existingContent) {
			await db.deleteReceiptContent(existingContent.id);
		}

		// Create new content
		const content: NewReceiptContent = {
			receiptId: receipt.id,
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
		};
		await db.createReceiptContent(content);
	} catch (error) {
		console.error("[Receipt Edit] Failed to save OCR content:", error);
	}
}

export async function deleteReceipt(receiptId: string) {
	const db = getDatabase();
	//Get entity relationships
	const _relationships = await db.getEntityRelationships("receipt", receiptId);

	//Delete file from storage
	const _storage = getReceiptStorage();

	await db.deleteReceipt(receiptId);
}
