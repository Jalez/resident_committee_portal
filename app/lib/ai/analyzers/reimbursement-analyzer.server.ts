/**
 * Reimbursement Analyzer
 * Priority Level 2 (Medium) - User intent
 * 
 * Analyzes reimbursement requests to suggest:
 * 1. Transaction (if not exists and amount/description are meaningful)
 * 2. Budget linkage (match description to budget keywords)
 * 
 * AI Enrichment:
 * - Suggests category based on description
 * - Suggests budget match
 */

import type { DatabaseAdapter } from "~/db/adapters/types";
import type { Purchase } from "~/db/schema";
import type { EntityAnalyzer, AnalysisResult, EntitySuggestion } from "../entity-relationship-analyzer.server";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";

interface ReimbursementAnalysis {
	category: string;
	suggestedBudgetId?: string;
	suggestedBudgetName?: string;
	shouldCreateTransaction: boolean;
	confidence: number;
	reasoning: string;
}

class ReimbursementAnalyzer implements EntityAnalyzer<Purchase> {
	async analyze(reimbursement: Purchase, db: DatabaseAdapter): Promise<AnalysisResult> {
		const suggestions: EntitySuggestion[] = [];
		const errors: string[] = [];

		try {
			// Check for existing relationships
			const existingRelationships = await db.getEntityRelationships("reimbursement", reimbursement.id);
			const hasTransaction = existingRelationships.some(rel => rel.relationBType === "transaction");
			const hasReceipt = existingRelationships.some(rel => rel.relationBType === "receipt");

			// Get available budgets for matching
			const year = reimbursement.year || new Date().getFullYear();
			const budgets = await db.getFundBudgetsByYear(year);

			// Run AI analysis
			const aiAnalysis = await this.analyzeWithAI(reimbursement, budgets, db);

			// 1. Suggest Transaction (if no receipt and no existing transaction)
			// Rationale: If there's a receipt, the transaction should come from there (higher priority)
			if (!hasReceipt && !hasTransaction && aiAnalysis?.shouldCreateTransaction) {
				suggestions.push({
					entityType: "transaction",
					name: reimbursement.description || "Transaction",
					data: {
						amount: reimbursement.amount,
						date: new Date(), // Reimbursements typically don't have purchase date stored
						description: reimbursement.description || "Reimbursement transaction",
						category: aiAnalysis.category,
						type: "expense",
						year: reimbursement.year,
						status: "draft",
					},
					confidence: 0.70,
					reasoning: `Transaction for reimbursement "${reimbursement.description}". Category: ${aiAnalysis.category}`,
				});
			}

			// 2. Suggest Budget linkage (via enrichment, actual linking done by user or later logic)
			if (aiAnalysis?.suggestedBudgetId) {
				// We don't create Budget entity, but we can include this as enrichment
				// The actual linking would happen in the save logic
			}

			return {
				suggestions,
				enrichment: {
					category: aiAnalysis?.category,
					tags: aiAnalysis?.suggestedBudgetId ? [`budget:${aiAnalysis.suggestedBudgetId}`] : [],
				},
				errors: errors.length > 0 ? errors : undefined,
			};
		} catch (error) {
			console.error("[ReimbursementAnalyzer] Analysis failed:", error);
			return {
				suggestions: [],
				errors: [error instanceof Error ? error.message : String(error)],
			};
		}
	}

	private async analyzeWithAI(
		reimbursement: Purchase,
		budgets: Array<{ id: string; name: string; description: string | null; }>,
		db: DatabaseAdapter
	): Promise<ReimbursementAnalysis | null> {
		try {
			const apiKeySetting = await db.getAppSetting(SETTINGS_KEYS.OPENROUTER_API_KEY);
			if (!apiKeySetting?.value) {
				console.warn("[ReimbursementAnalyzer] OpenRouter API key not configured");
				return null;
			}

			const openrouter = createOpenRouter({ apiKey: apiKeySetting.value });

			// Build budget list for matching
			const budgetList = budgets
				.map(b => `- "${b.name}" (ID: ${b.id})${b.description ? ` - ${b.description}` : ""}`)
				.join("\n");

			const prompt = `Analyze this reimbursement request:

Description: ${reimbursement.description || "N/A"}
Amount: €${reimbursement.amount}
Purchaser: ${reimbursement.purchaserName || "Unknown"}

Available Budgets for ${reimbursement.year}:
${budgetList || "No budgets available"}

Determine:
1. Best category for this expense (e.g., "Groceries", "Office Supplies", "Equipment", "Travel", "Food & Drink", etc.)
2. Does this match any of the available budgets? (match by keywords in description)
3. Should a transaction be created? (usually yes if this is a legitimate organizational expense)

Return ONLY valid JSON (no markdown):
{
  "category": string,
  "suggestedBudgetId": string | null (budget ID if matched),
  "suggestedBudgetName": string | null,
  "shouldCreateTransaction": boolean,
  "confidence": number (0-1),
  "reasoning": string
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

			const analysis = JSON.parse(jsonText) as ReimbursementAnalysis;
			return analysis;
		} catch (error) {
			console.error("[ReimbursementAnalyzer] AI analysis failed:", error);
			return null;
		}
	}
}

export const reimbursementAnalyzer = new ReimbursementAnalyzer();
