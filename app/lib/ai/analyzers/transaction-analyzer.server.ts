/**
 * Transaction Analyzer
 * Priority Level 3 (Low) - Mechanical proof of payment
 *
 * Analyzes transactions to suggest:
 * 1. Budget linkage (match description to budgets)
 * 2. Inventory items
 *
 * AI Enrichment:
 * - Suggests budget match
 * - Limited suggestions as transactions are usually linked FROM other entities
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import type { DatabaseAdapter } from "~/db/adapters/types";
import type { Transaction } from "~/db/schema";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import { formatDate } from "~/lib/format-utils";
import type {
	AnalysisResult,
	EntityAnalyzer,
	EntitySuggestion,
} from "../entity-relationship-analyzer.server";

interface TransactionAnalysis {
	suggestedBudgetId?: string;
	suggestedBudgetName?: string;
	confidence: number;
	reasoning: string;
}

class TransactionAnalyzer implements EntityAnalyzer<Transaction> {
	async analyze(
		transaction: Transaction,
		db: DatabaseAdapter,
	): Promise<AnalysisResult> {
		const suggestions: EntitySuggestion[] = [];
		const errors: string[] = [];

		try {
			// Get available budgets for matching
			const year = transaction.year || new Date().getFullYear();
			const budgets = await db.getFundBudgetsByYear(year);

			// Run AI analysis for budget matching
			const aiAnalysis = await this.analyzeWithAI(transaction, budgets, db);

			// Transactions are typically consumers, not providers
			// They usually get linked FROM receipts or reimbursements
			// So we don't suggest creating new entities here

			// Budget linkage suggestion is included in enrichment
			return {
				suggestions, // Empty - transactions don't generate other entities
				enrichment: {
					tags: aiAnalysis?.suggestedBudgetId
						? [`budget:${aiAnalysis.suggestedBudgetId}`]
						: [],
				},
				errors: errors.length > 0 ? errors : undefined,
			};
		} catch (error) {
			console.error("[TransactionAnalyzer] Analysis failed:", error);
			return {
				suggestions: [],
				errors: [error instanceof Error ? error.message : String(error)],
			};
		}
	}

	private async analyzeWithAI(
		transaction: Transaction,
		budgets: Array<{ id: string; name: string; description: string | null }>,
		db: DatabaseAdapter,
	): Promise<TransactionAnalysis | null> {
		try {
			const apiKeySetting = await db.getAppSetting(
				SETTINGS_KEYS.OPENROUTER_API_KEY,
			);
			if (!apiKeySetting?.value) {
				console.warn("[TransactionAnalyzer] OpenRouter API key not configured");
				return null;
			}

			const openrouter = createOpenRouter({ apiKey: apiKeySetting.value });

			// Build budget list for matching
			const budgetList = budgets
				.map(
					(b) =>
						`- "${b.name}" (ID: ${b.id})${b.description ? ` - ${b.description}` : ""}`,
				)
				.join("\n");

			const prompt = `Analyze this transaction for budget matching:

Description: ${transaction.description}
Amount: €${transaction.amount}
Date: ${formatDate(transaction.date)}

Available Budgets for ${transaction.year}:
${budgetList || "No budgets available"}

Determine if this transaction matches any of the available budgets (match by keywords and description).

Return ONLY valid JSON (no markdown):
{
  "suggestedBudgetId": string | null (budget ID if matched),
  "suggestedBudgetName": string | null,
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

			const analysis = JSON.parse(jsonText) as TransactionAnalysis;
			return analysis;
		} catch (error) {
			console.error("[TransactionAnalyzer] AI analysis failed:", error);
			return null;
		}
	}
}

export const transactionAnalyzer = new TransactionAnalyzer();
