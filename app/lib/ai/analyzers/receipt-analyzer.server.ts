/**
 * Receipt Analyzer
 * Priority Level 1 (Highest) - Physical proof of purchase
 *
 * Analyzes receipts to suggest:
 * 1. Transaction (with AI-enriched category)
 * 2. Inventory items (for durable goods from line items)
 * 3. Reimbursement request (if no existing reimbursement)
 *
 * AI Enrichment:
 * - Suggests category based on store name and items
 * - Flags line items as "inventory-candidate" for durable goods
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import type { DatabaseAdapter } from "~/db/adapters/types";
import type { Receipt, ReceiptContent } from "~/db/schema";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import type {
	AnalysisResult,
	EntityAnalyzer,
	EntitySuggestion,
} from "../entity-relationship-analyzer.server";

interface ReceiptAnalysis {
	category: string;
	transactionDescription: string;
	lineItems: Array<{
		name: string;
		isInventoryCandidate: boolean;
		suggestedLocation?: string;
		reasoning: string;
	}>;
	shouldCreateReimbursement: boolean;
	reasoning: string;
}

class ReceiptAnalyzer implements EntityAnalyzer<Receipt> {
	async analyze(
		receipt: Receipt,
		db: DatabaseAdapter,
	): Promise<AnalysisResult> {
		const suggestions: EntitySuggestion[] = [];
		const errors: string[] = [];

		try {
			// Get receipt content (OCR data)
			const content = await db.getReceiptContentByReceiptId(receipt.id);
			if (!content) {
				return {
					suggestions: [],
					errors: [
						"No receipt content found (OCR may not have been processed)",
					],
				};
			}

			// Parse line items from JSON
			let items: Array<{
				name?: string;
				description?: string;
				quantity?: number;
				price?: number;
				total?: number;
			}> = [];
			if (content.items) {
				try {
					items = JSON.parse(content.items);
				} catch (_e) {
					errors.push("Failed to parse receipt items");
				}
			}

			// Run AI analysis
			const aiAnalysis = await this.analyzeWithAI(content, items, db);
			if (!aiAnalysis) {
				return {
					suggestions: [],
					errors: ["AI analysis failed or API key not configured"],
				};
			}

			// 1. Suggest Transaction
			// Check if transaction already exists
			const existingRelationships = await db.getEntityRelationships(
				"receipt",
				receipt.id,
			);
			const hasTransaction = existingRelationships.some(
				(rel) => rel.relationBType === "transaction",
			);

			if (!hasTransaction) {
				suggestions.push({
					entityType: "transaction",
					name:
						aiAnalysis.transactionDescription ||
						content.storeName ||
						"Transaction",
					data: {
						amount: content.totalAmount || "0",
						date: content.purchaseDate || new Date(),
						description:
							aiAnalysis.transactionDescription ||
							content.storeName ||
							"Transaction from receipt",
						category: aiAnalysis.category,
						type: "expense",
						year: content.purchaseDate
							? new Date(content.purchaseDate).getFullYear()
							: new Date().getFullYear(),
						status: "draft",
					},
					confidence: 0.95,
					reasoning: `Transaction for receipt from ${content.storeName}. Category: ${aiAnalysis.category}`,
				});
			}

			// 2. Suggest Inventory Items (for flagged line items)
			const inventoryCandidates = aiAnalysis.lineItems.filter(
				(item) => item.isInventoryCandidate,
			);
			for (const candidate of inventoryCandidates) {
				// Find the corresponding item data
				const itemData = items.find((i) =>
					(i.name || i.description || "")
						.toLowerCase()
						.includes(candidate.name.toLowerCase()),
				);

				suggestions.push({
					entityType: "inventory",
					name: candidate.name,
					data: {
						name: candidate.name,
						value:
							itemData?.total?.toString() || itemData?.price?.toString() || "0",
						purchasedAt: content.purchaseDate || new Date(),
						description: `From ${content.storeName || "receipt"}`,
						location: candidate.suggestedLocation || "storage",
						status: "draft",
					},
					confidence: 0.75,
					reasoning: candidate.reasoning,
					metadata: {
						sourceItemName: itemData?.name || itemData?.description,
					},
				});
			}

			// 3. Suggest Reimbursement (if no existing reimbursement)
			const hasReimbursement = existingRelationships.some(
				(rel) => rel.relationBType === "reimbursement",
			);
			if (!hasReimbursement && aiAnalysis.shouldCreateReimbursement) {
				suggestions.push({
					entityType: "reimbursement",
					name: `Reimbursement for ${content.storeName || "purchase"}`,
					data: {
						amount: content.totalAmount || "0",
						year: content.purchaseDate
							? new Date(content.purchaseDate).getFullYear()
							: new Date().getFullYear(),
						purchaserName: "Unknown", // Would ideally get from current user
						bankAccount: "",
						minutesId: "draft",
						description: `Purchase from ${content.storeName || "receipt"}`,
						status: "draft",
					},
					confidence: 0.65,
					reasoning: aiAnalysis.reasoning,
				});
			}

			return {
				suggestions,
				enrichment: {
					category: aiAnalysis.category,
					tags: inventoryCandidates.length > 0 ? ["has-inventory-items"] : [],
					description: aiAnalysis.transactionDescription,
				},
				errors: errors.length > 0 ? errors : undefined,
			};
		} catch (error) {
			console.error("[ReceiptAnalyzer] Analysis failed:", error);
			return {
				suggestions: [],
				errors: [error instanceof Error ? error.message : String(error)],
			};
		}
	}

	private async analyzeWithAI(
		content: ReceiptContent,
		items: Array<{
			name?: string;
			description?: string;
			quantity?: number;
			price?: number;
			total?: number;
		}>,
		db: DatabaseAdapter,
	): Promise<ReceiptAnalysis | null> {
		try {
			const apiKeySetting = await db.getAppSetting(
				SETTINGS_KEYS.OPENROUTER_API_KEY,
			);
			if (!apiKeySetting?.value) {
				console.warn("[ReceiptAnalyzer] OpenRouter API key not configured");
				return null;
			}

			const openrouter = createOpenRouter({ apiKey: apiKeySetting.value });

			// Build prompt
			const itemsList = items
				.map((item) => {
					const name = item.name || item.description || "Unknown";
					const price = item.total || item.price || 0;
					return `- ${name} (€${price})`;
				})
				.join("\n");

			const prompt = `Analyze this receipt and suggest entities to create:

Store: ${content.storeName || "Unknown"}
Total Amount: €${content.totalAmount || 0}
Purchase Date: ${content.purchaseDate ? new Date(content.purchaseDate).toLocaleDateString() : "Unknown"}

Line Items:
${itemsList || "No items"}

Determine:
1. Best high-level category for this purchase (e.g., "Groceries", "Office Supplies", "Equipment", "Food & Drink", "Tools", "Electronics", etc.)
2. An improved transaction description (better than just the store name)
3. For EACH line item, determine if it's a DURABLE INVENTORY item:
   - YES for: tools, furniture, electronics, kitchen equipment, storage containers, decorations, reusable items
   - NO for: consumables (food, drinks, paper goods, cleaning supplies), one-time services
4. Whether a reimbursement request should be created (usually yes unless this looks like a personal purchase)

Return ONLY valid JSON (no markdown):
{
  "category": string,
  "transactionDescription": string,
  "lineItems": [
    {
      "name": string,
      "isInventoryCandidate": boolean,
      "suggestedLocation": string (e.g., "kitchen", "storage", "office", "event space"),
      "reasoning": string (brief explanation)
    }
  ],
  "shouldCreateReimbursement": boolean,
  "reasoning": string (brief explanation for reimbursement decision)
}`;

			const { text } = await generateText({
				model: openrouter("anthropic/claude-3.5-sonnet"),
				prompt,
				temperature: 0.2,
			});

			if (!text) return null;

			// Clean markdown if present
			let jsonText = text.trim();
			if (jsonText.startsWith("```")) {
				const match = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
				if (match) {
					jsonText = match[1].trim();
				}
			}

			const analysis = JSON.parse(jsonText) as ReceiptAnalysis;
			return analysis;
		} catch (error) {
			console.error("[ReceiptAnalyzer] AI analysis failed:", error);
			return null;
		}
	}
}

export const receiptAnalyzer = new ReceiptAnalyzer();
