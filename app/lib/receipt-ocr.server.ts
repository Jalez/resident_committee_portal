import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { getDatabase } from "~/db/server.server";
import type { NewReceiptContent } from "~/db/schema";
import { extractTextFromImage } from "~/lib/google-vision.server";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import { getReceiptStorage } from "~/lib/receipts/server";

export interface OCRResult {
	success: boolean;
	rawText?: string;
	data?: {
		storeName?: string;
		items?: Array<{
			name: string;
			quantity: number;
			unitPrice?: number;
			totalPrice?: number;
		}>;
		totalAmount?: number;
		currency?: string;
		purchaseDate?: string; // ISO date string or YYYY-MM-DD
	};
	error?: string;
}

/**
 * Process a receipt:
 * 1. Fetch image content (base64)
 * 2. OCR text extraction (Google Vision)
 * 3. AI Parsing (OpenRouter)
 * 4. Save to Database
 */
export async function processReceiptOCR(
	receiptUrl: string,
	receiptId: string,
	rawTextOverride?: string | null,
): Promise<OCRResult> {
	console.log(`[OCR] Processing receipt ${receiptId}`);

	let rawText = rawTextOverride?.trim() || "";

	if (!rawText) {
		// 1. Fetch Image
		const storage = getReceiptStorage();
		const imageBase64 = await storage.getReceiptContentBase64(receiptUrl);

		if (!imageBase64) {
			console.error("[OCR] Failed to retrieve image content");
			return { success: false, error: "Failed to retrieve image content" };
		}

		// 2. Extract Text (OCR)
		const extractedText = await extractTextFromImage(imageBase64);
		if (!extractedText) {
			console.error("[OCR] Failed to extract text from image");
			return { success: false, error: "Cloud Vision API returned no text" };
		}
		rawText = extractedText;
	} else {
		console.log("[OCR] Using provided raw text for parsing");
	}

	// 3. AI Parsing (if configured)
	const db = getDatabase();
	const apiKey = await db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY);
	const model = await db.getSetting(SETTINGS_KEYS.RECEIPT_AI_MODEL);

	let parsedData: OCRResult["data"] = {};
	let aiModelUsed: string | null = null;
	let aiError: string | null = null;

	if (apiKey && model) {
		try {
			console.log(`[OCR] Parsing text with model ${model}`);
			const openrouter = createOpenRouter({ apiKey });

			const prompt = `
You are an expert receipt parser. Extract structued data from the following receipt OCR text.
Return ONLY valid JSON (no markdown formatting).

OCR Text:
"""
${rawText}
"""

Required JSON Structure:
{
  "storeName": "Store Name",
  "items": [
    { "name": "Item Name", "quantity": 1, "unitPrice": 10.50, "totalPrice": 10.50 }
  ],
  "totalAmount": 10.50,
  "currency": "EUR",
  "purchaseDate": "YYYY-MM-DD" // Use YYYY-MM-DD format. If year is missing, assume current year.
}

Notes:
- If quantity is missing, assume 1.
- If currency is not found, default to "EUR".
- Parse prices as numbers (e.g. 10.50).
- If date is ambiguous, make a best guess or leave null.
`;

			const { text } = await generateText({
				model: openrouter(model),
				prompt,
			});

			const jsonStr = text
				.replace(/```json/g, "")
				.replace(/```/g, "")
				.trim();
			parsedData = JSON.parse(jsonStr);
			aiModelUsed = model;
			console.log("[OCR] AI parsing successful");
		} catch (error) {
			console.error("[OCR] AI Parsing failed:", error);
			aiError = "AI parsing failed";
		}
	} else {
		console.log("[OCR] Skipping AI parsing (no API key or model setting)");
	}

	// 4. Save to Database
	try {
		// Check if content already exists, delete if so (re-run scenario)
		const existing = await db.getReceiptContentByReceiptId(receiptId);
		if (existing) {
			await db.deleteReceiptContent(existing.id);
		}

		const content: NewReceiptContent = {
			receiptId,
			rawText,
			storeName: parsedData?.storeName || null,
			items: parsedData?.items ? JSON.stringify(parsedData.items) : null,
			totalAmount: parsedData?.totalAmount?.toString() || null,
			currency: parsedData?.currency || "EUR",
			purchaseDate: parsedData?.purchaseDate
				? new Date(parsedData.purchaseDate)
				: null,
			aiModel: aiModelUsed,
		};

		await db.createReceiptContent(content);
		console.log("[OCR] Saved results to database");

		return {
			success: !aiError,
			rawText,
			data: parsedData,
			error: aiError || undefined,
		};
	} catch (error) {
		console.error("[OCR] Database save failed:", error);
		return { success: false, error: "Database save error", rawText };
	}
}
