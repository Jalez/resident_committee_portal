import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import type { DatabaseAdapter } from "~/db/adapters/types";
import { SETTINGS_KEYS } from "../openrouter.server";

interface RelationshipContext {
	id: string;
	date: Date | null;
	totalAmount: number | null;
	description: string | null;
	currency: string | null;
	category: string | null;
	purchaserId: string | null;
	lineItems: Array<{
		name: string;
		quantity: number;
		unitPrice: number;
		totalPrice: number;
	}>;
	valueSource:
		| "manual"
		| "receipt"
		| "reimbursement"
		| "transaction"
		| "unknown";
	linkedEntityIds: string[];
}

export type TransactionCategory =
	| "inventory"
	| "office_supplies"
	| "travel"
	| "food"
	| "equipment"
	| "marketing"
	| "software"
	| "utilities"
	| "rent"
	| "other";

export interface AIEnrichmentResult {
	suggestedCategory: TransactionCategory | null;
	suggestedDescription: string | null;
	confidence: number;
	reasoning: string;
	tags: string[];
}

/**
 * Analyzes the RelationshipContext to enrich it with suggested metadata.
 * Uses the Provider/Consumer model: context provides data, AI consumes it and provides suggestions.
 */
export async function analyzeRelationshipContext(
	db: DatabaseAdapter,
	context: RelationshipContext,
): Promise<AIEnrichmentResult | null> {
	try {
		// Get API key from settings
		const apiKeySetting = await db.getAppSetting(
			SETTINGS_KEYS.OPENROUTER_API_KEY,
		);
		if (!apiKeySetting?.value) {
			console.warn("[RelationshipAnalyzer] OpenRouter API key not configured");
			return null;
		}

		const openrouter = createOpenRouter({
			apiKey: apiKeySetting.value,
		});

		// 1. Build Prompt Context from RelationshipContext
		const info = [
			`Description: ${context.description || "N/A"}`,
			`Total Amount: ${context.totalAmount} ${context.currency}`,
			`Date: ${context.date?.toISOString().split("T")[0] || "N/A"}`,
			`Value Source: ${context.valueSource}`,
		];

		if (context.lineItems.length > 0) {
			info.push("Line Items:");
			context.lineItems.forEach((item) => {
				info.push(`- ${item.quantity}x ${item.name} (${item.totalPrice} EUR)`);
			});
		}

		const promptContext = info.join("\n");

		const prompt = `You are a financial assistant for an organization. 
Analyze the following transaction context and suggest a categorization and tags.

CONTEXT:
${promptContext}

Available Categories:
- inventory: Items for resale or stock (equipment, products, materials for inventory)
- office_supplies: Office materials
- travel: Transport, accommodation
- food: Meals, catering
- equipment: Persistent assets
- marketing: Ads, promo
- software: Licenses, digital services
- utilities: Electricity, water, net
- rent: Facility costs
- other

Respond ONLY with a JSON object:
{
  "category": "category_key",
  "description": "Improved description (optional, null if current is good)",
  "reasoning": "Brief explanation",
  "tags": ["tag1", "tag2"]
}`;

		// 2. Call AI
		const { text } = await generateText({
			model: openrouter("anthropic/claude-3.5-sonnet"), // Hardcoded for now, or fetch from settings
			prompt,
			temperature: 0.1,
		});

		if (!text) return null;

		const parsed = JSON.parse(text);

		return {
			suggestedCategory: parsed.category as TransactionCategory,
			suggestedDescription: parsed.description || null,
			confidence: 0.8, // Static confidence for now
			reasoning: parsed.reasoning,
			tags: parsed.tags || [],
		};
	} catch (error) {
		console.error("[RelationshipAnalyzer] Analysis failed:", error);
		return null;
	}
}

import type { Receipt } from "~/db/schema";

/**
 * Adapter to analyze a receipt directly by converting it to a pseudo-RelationshipContext
 */
export async function analyzeReceiptForTransaction(
	db: DatabaseAdapter,
	receipt: Receipt,
): Promise<AIEnrichmentResult | null> {
	let lineItems: any[] = [];
	try {
		if (receipt.items) {
			lineItems = JSON.parse(receipt.items);
		}
	} catch (_e) {}

	const context: RelationshipContext = {
		id: `virtual-receipt-${receipt.id}`,
		date: receipt.purchaseDate ? new Date(receipt.purchaseDate) : null,
		totalAmount: receipt.totalAmount ? parseFloat(receipt.totalAmount) : null,
		description: receipt.storeName,
		currency: receipt.currency || "EUR",
		category: null,
		purchaserId: null,
		valueSource: "receipt",
		linkedEntityIds: [],
		lineItems: lineItems.map((item: any) => ({
			name: item.description || item.name || "Unknown Item",
			quantity: item.quantity || 1,
			unitPrice: item.price || 0,
			totalPrice: item.total || 0,
		})),
	};

	return analyzeRelationshipContext(db, context);
}
