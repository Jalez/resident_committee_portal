import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { extractTextFromPDF } from "~/lib/google-documentai.server";
import { extractTextFromImage } from "~/lib/google-vision.server";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";

/**
 * API endpoint to analyze a receipt file with OCR + AI parsing
 * Does NOT save to database - just returns the parsed data
 */
export async function action({ request }: ActionFunctionArgs) {
	await requirePermission(request, "treasury:receipts:write", getDatabase);

	const formData = await request.formData();
	const file = formData.get("file") as File | null;

	if (!file) {
		return Response.json({ error: "File is required" }, { status: 400 });
	}

	try {
		// Convert file to buffer
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// 1. Extract text with OCR (use Document AI for PDFs, Vision for images)
		console.log(
			"[Analyze Receipt] Starting OCR extraction for file:",
			file.name,
			"type:",
			file.type,
			"size:",
			file.size,
		);

		let rawText: string | null = null;

		if (file.type === "application/pdf") {
			// Use Document AI for PDFs
			console.log("[Analyze Receipt] Using Document AI for PDF");
			rawText = await extractTextFromPDF(buffer);
		} else {
			// Use Vision API for images
			console.log("[Analyze Receipt] Using Vision API for image");
			const base64 = buffer.toString("base64");
			rawText = await extractTextFromImage(base64);
		}

		console.log(
			"[Analyze Receipt] OCR result:",
			rawText ? `${rawText.substring(0, 100)}...` : "null",
		);

		if (!rawText) {
			console.error(
				"[Analyze Receipt] Failed to extract text from file:",
				file.name,
			);
			const errorDetails =
				file.type === "application/pdf"
					? "Document AI returned no text. Ensure GOOGLE_CLOUD_PROJECT_ID, DOCUMENT_AI_LOCATION, DOCUMENT_AI_PROCESSOR_ID, and GOOGLE_APPLICATION_CREDENTIALS_JSON are set."
					: "Google Vision API returned no text. Check if GOOGLE_API_KEY is set and the file format is supported.";

			return Response.json(
				{
					error: "Failed to extract text from file",
					details: errorDetails,
				},
				{ status: 400 },
			);
		}

		// 2. Parse with AI (if configured)
		const db = getDatabase();
		const apiKey = await db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY);
		const model = await db.getSetting(SETTINGS_KEYS.RECEIPT_AI_MODEL);

		let parsedData: {
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
		} = {};

		let aiError: string | null = null;
		let suggestedName = "";
		let suggestedDescription = "";

		if (apiKey && model) {
			try {
				const openrouter = createOpenRouter({ apiKey });

				// First, parse the receipt structure
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

				const jsonStr = parseText
					.replace(/```json/g, "")
					.replace(/```/g, "")
					.trim();
				parsedData = JSON.parse(jsonStr);

				// Second, generate suggested name and description for the receipt
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

				const suggestJsonStr = suggestText
					.replace(/```json/g, "")
					.replace(/```/g, "")
					.trim();
				const suggestions = JSON.parse(suggestJsonStr);
				suggestedName = suggestions.name || "";
				suggestedDescription = suggestions.description || "";
			} catch (error) {
				console.error("[Analyze Receipt] AI parsing failed:", error);
				aiError = error instanceof Error ? error.message : "AI parsing failed";
			}
		}

		return Response.json({
			success: true,
			rawText,
			parsedData,
			suggestedName,
			suggestedDescription,
			error: aiError,
		});
	} catch (error) {
		console.error("[Analyze Receipt] Error:", error);
		return Response.json(
			{
				error: "Failed to analyze receipt",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
