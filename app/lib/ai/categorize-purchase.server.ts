import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { getDatabase } from "~/db/server.server";

export interface PurchaseCategorization {
	isInventory: boolean;
	category: string; // "inventory", "food", "travel", "supplies", etc.
	transactionType: "income" | "expense";
	suggestedLocation?: string; // For inventory items
	reasoning: string;
}

/**
 * Uses AI to categorize a purchase item and determine if it should be added to inventory
 * @param itemName Name of the purchased item
 * @param storeName Optional store name for additional context
 * @param totalAmount Optional total amount for additional context
 * @returns Purchase categorization with inventory recommendation
 */
export async function categorizePurchase(
	itemName: string,
	storeName?: string,
	totalAmount?: number,
): Promise<PurchaseCategorization> {
	const db = getDatabase();

	// Get AI model setting from database
	const modelSetting = await db.getAppSetting("PURCHASE_CATEGORIZATION_MODEL");
	const model = modelSetting?.value || "google/gemini-flash-1.5";

	const openrouter = createOpenRouter({
		apiKey: process.env.OPENROUTER_API_KEY,
	});

	const prompt = `Analyze this purchase and categorize it:
- Item: ${itemName}
${storeName ? `- Store: ${storeName}` : ""}
${totalAmount ? `- Amount: €${totalAmount.toFixed(2)}` : ""}

Determine:
1. Is this a physical inventory item (equipment, supplies that last, reusable items)?
   - YES for: tools, furniture, electronics, kitchen equipment, storage containers, decorations
   - NO for: consumables (food, drinks), one-time services, digital goods, travel expenses
2. What expense category best fits? (inventory/food/travel/event/supplies/other)
3. If this is inventory, suggest a likely location (storage/office/event space/kitchen/common area/etc)
4. Transaction type (almost always "expense" for purchases)

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "isInventory": boolean,
  "category": string,
  "transactionType": "income" | "expense",
  "suggestedLocation": string | null,
  "reasoning": string
}`;

	try {
		const result = await generateText({
			model: openrouter(model),
			prompt,
			temperature: 0.3, // Lower temperature for more consistent categorization
		});

		// Parse the AI response
		const text = result.text.trim();
		let jsonText = text;

		// Remove markdown code blocks if present
		if (text.startsWith("```")) {
			const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
			if (match) {
				jsonText = match[1].trim();
			}
		}

		const categorization = JSON.parse(jsonText) as PurchaseCategorization;

		// Validate the response
		if (
			typeof categorization.isInventory !== "boolean" ||
			typeof categorization.category !== "string" ||
			typeof categorization.transactionType !== "string" ||
			typeof categorization.reasoning !== "string"
		) {
			throw new Error("Invalid AI response format");
		}

		return categorization;
	} catch (error) {
		console.error("Error categorizing purchase:", error);
		// Return safe default categorization on error
		return {
			isInventory: false,
			category: "other",
			transactionType: "expense",
			reasoning: `AI categorization failed: ${error instanceof Error ? error.message : "Unknown error"}. Defaulting to non-inventory.`,
		};
	}
}
