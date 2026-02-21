import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server.server";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { deleteOldFile } from "~/lib/file-upload.server";
import { extractTextFromPDF } from "~/lib/google-documentai.server";
import { extractTextFromImage } from "~/lib/google-vision.server";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import { buildReceiptPath, getReceiptStorage } from "~/lib/receipts/server";

interface ParsedData {
	storeName?: string;
	items?: Array<{
		name: string;
		quantity: number;
		unitPrice?: number;
		totalPrice?: number;
	}>;
	totalAmount?: number;
	currency?: string;
	purchaseDate?: string;
}

async function parseWithAI(rawText: string): Promise<{
	parsedData: ParsedData;
	suggestedName: string;
	suggestedDescription: string;
	error?: string;
}> {
	const db = getDatabase();
	const apiKey = await db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY);
	const model = await db.getSetting(SETTINGS_KEYS.RECEIPT_AI_MODEL);

	if (!apiKey || !model) {
		return {
			parsedData: {},
			suggestedName: "",
			suggestedDescription: "",
			error: "AI model or API key not configured",
		};
	}

	try {
		const openrouter = createOpenRouter({ apiKey });
		const parsePrompt = `
You are an expert receipt parser. Extract structured data from the following receipt OCR text.
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
  "purchaseDate": "YYYY-MM-DD"
}

Notes:
- If quantity is missing, assume 1.
- If currency is not found, default to "EUR".
- Parse prices as numbers (e.g. 10.50).
- If date is ambiguous, make a best guess or leave null.
- Use YYYY-MM-DD format for dates. If year is missing, assume ${new Date().getFullYear()}.
`;

		const { text: parseText } = await generateText({
			model: openrouter(model),
			prompt: parsePrompt,
			temperature: 0.3,
		});

		const parsedData = JSON.parse(
			parseText.replace(/```json/g, "").replace(/```/g, "").trim(),
		) as ParsedData;

		const suggestPrompt = `
Based on this receipt data, suggest a concise name and brief description for filing purposes.

Receipt Data:
- Store: ${parsedData.storeName || "Unknown"}
- Date: ${parsedData.purchaseDate || "Unknown"}
- Total: ${parsedData.currency || "EUR"} ${parsedData.totalAmount || "0"}
- Items: ${parsedData.items?.map((i) => i.name).join(", ") || "Unknown"}

Return ONLY valid JSON:
{
  "name": "Brief name for this receipt (e.g., 'K-Market groceries' or 'Hardware supplies')",
  "description": "Optional 1-2 sentence description of what was purchased and why (can be empty string if obvious from name)"
}

Keep the name under 50 characters and description under 150 characters.
`;

		const { text: suggestText } = await generateText({
			model: openrouter(model),
			prompt: suggestPrompt,
			temperature: 0.5,
		});

		const suggestions = JSON.parse(
			suggestText.replace(/```json/g, "").replace(/```/g, "").trim(),
		) as { name?: string; description?: string };

		return {
			parsedData,
			suggestedName: suggestions.name || "",
			suggestedDescription: suggestions.description || "",
		};
	} catch (error) {
		return {
			parsedData: {},
			suggestedName: "",
			suggestedDescription: "",
			error: error instanceof Error ? error.message : "AI parsing failed",
		};
	}
}

export async function action({ request, params }: ActionFunctionArgs) {
	const receiptId = params.receiptId;
	if (!receiptId) {
		return Response.json({ success: false, error: "Missing receiptId" }, { status: 400 });
	}

	const formData = await request.formData();
	const file = formData.get("file") as File | null;
	const analyzeWithAI = formData.get("analyzeWithAI") !== "false";

	if (!file) {
		return Response.json({ success: false, error: "File is required" }, { status: 400 });
	}

	const db = getDatabase();
	const receipt = await db.getReceiptById(receiptId);
	if (!receipt) {
		return Response.json({ success: false, error: "Receipt not found" }, { status: 404 });
	}

	await requirePermissionOrSelf(
		request,
		"treasury:receipts:update",
		"treasury:receipts:update-self",
		receipt.createdBy,
		getDatabase,
	);

	try {
		const year = receipt.pathname?.match(/\/(\d{4})\//)?.[1] || new Date().getFullYear().toString();
		const receiptName = (receipt.name || "kuitti").trim() || "kuitti";
		const pathname = buildReceiptPath(year, file.name, receiptName);
		const storage = getReceiptStorage();
		const uploadResult = await storage.uploadFile(pathname, file, {
			access: "public",
		});

		let rawText: string | null = null;
		let parsedData: ParsedData = {};
		let suggestedName = "";
		let suggestedDescription = "";
		let aiError: string | undefined;

		if (analyzeWithAI) {
			const arrayBuffer = await file.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);
			const isPdf =
				file.type === "application/pdf" ||
				file.name.toLowerCase().endsWith(".pdf");
			rawText =
				isPdf
					? await extractTextFromPDF(buffer)
					: await extractTextFromImage(buffer.toString("base64"));

			if (!rawText) {
				return Response.json(
					{ success: false, error: "Failed to extract text from file" },
					{ status: 400 },
				);
			}

			const aiResult = await parseWithAI(rawText);
			parsedData = aiResult.parsedData;
			suggestedName = aiResult.suggestedName;
			suggestedDescription = aiResult.suggestedDescription;
			aiError = aiResult.error;
		}

		await db.updateReceipt(receiptId, {
			url: uploadResult.url,
			pathname: uploadResult.pathname,
			rawText: rawText,
			storeName: parsedData.storeName || null,
			items: parsedData.items ? JSON.stringify(parsedData.items) : null,
			totalAmount:
				typeof parsedData.totalAmount === "number"
					? parsedData.totalAmount.toString()
					: null,
			currency: parsedData.currency || "EUR",
			purchaseDate: parsedData.purchaseDate
				? new Date(parsedData.purchaseDate)
				: null,
			aiModel: analyzeWithAI ? "OpenRouter via ingest API" : null,
			ocrProcessed: analyzeWithAI,
			ocrProcessedAt: analyzeWithAI ? new Date() : null,
		});

		if (receipt.pathname && receipt.pathname !== uploadResult.pathname) {
			await deleteOldFile("receipt", receipt.pathname);
		}

		return Response.json({
			success: true,
			url: uploadResult.url,
			pathname: uploadResult.pathname,
			rawText: rawText || "",
			parsedData,
			suggestedName,
			suggestedDescription,
			error: aiError,
		});
	} catch (error) {
		console.error("[Receipt Ingest] Failed:", error);
		return Response.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to ingest receipt",
			},
			{ status: 500 },
		);
	}
}
