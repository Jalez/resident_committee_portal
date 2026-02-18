/**
 * Per-Type AI Analyzers
 *
 * Each analyzer examines a source entity and suggests related entities to create.
 * Follows the Context-Centric design: extracts data to populate RelationshipContext,
 * then suggests entities based on that context.
 *
 * All created entities are marked as "draft" and linked to the source entity.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import type { DatabaseAdapter } from "~/db/adapters/types";
import type { NewEntityRelationship } from "~/db/schema";
import type { RelationshipEntityType } from "~/db/types";
import { SETTINGS_KEYS } from "../openrouter.server";

export interface SuggestedEntity {
	entityType: RelationshipEntityType;
	name: string;
	data: Record<string, unknown>;
	metadata?: Record<string, unknown>;
	confidence: number;
	reasoning: string;
}

export interface AnalysisResult {
	success: boolean;
	created: Array<{ type: RelationshipEntityType; id: string; name: string }>;
	errors: string[];
}

interface AnalysisContext {
	description?: string | null;
	totalAmount?: number | null;
	date?: Date | null;
	currency?: string;
	lineItems?: Array<{
		name: string;
		quantity: number;
		unitPrice: number;
		totalPrice: number;
	}>;
}

/**
 * Get OpenRouter client with API key from settings
 */
async function getOpenRouter(db: DatabaseAdapter) {
	const apiKeySetting = await db.getAppSetting(
		SETTINGS_KEYS.OPENROUTER_API_KEY,
	);
	if (!apiKeySetting?.value) {
		throw new Error("OpenRouter API key not configured");
	}
	return createOpenRouter({ apiKey: apiKeySetting.value });
}

/**
 * Create a draft entity and link it to the source entity
 */
async function createDraftEntity(
	db: DatabaseAdapter,
	sourceType: RelationshipEntityType,
	sourceId: string,
	suggestion: SuggestedEntity,
	createdBy: string,
): Promise<{ type: RelationshipEntityType; id: string; name: string } | null> {
	try {
		let entityId: string;
		let entityName: string;

		// Create the draft entity based on type
		switch (suggestion.entityType) {
			case "transaction": {
				const transaction = await db.createTransaction({
					year: new Date().getFullYear(),
					type: (suggestion.data.type as "income" | "expense") || "expense",
					amount: String(suggestion.data.amount || "0"),
					description: String(suggestion.data.description || suggestion.name),
					date: suggestion.data.date
						? new Date(suggestion.data.date as string)
						: new Date(),
					status: "draft",
					createdBy,
				});
				entityId = transaction.id;
				entityName = transaction.description;
				break;
			}

			case "inventory": {
				const item = await db.createInventoryItem({
					name: suggestion.name,
					description: suggestion.data.description as string | undefined,
					value: String(suggestion.data.value || "0"),
					quantity: (suggestion.data.quantity as number) || 1,
					purchasedAt: suggestion.data.purchasedAt
						? new Date(suggestion.data.purchasedAt as string)
						: new Date(),
					status: "draft",
					needsCompletion: true,
				});
				entityId = item.id;
				entityName = item.name;
				break;
			}

			case "reimbursement": {
				const reimbursement = await db.createPurchase({
					description: suggestion.name,
					amount: String(suggestion.data.amount || "0"),
					purchaserName: String(suggestion.data.purchaserName || ""),
					bankAccount: String(suggestion.data.bankAccount || ""),
					minutesId: String(suggestion.data.minutesId || ""),
					minutesName: suggestion.data.minutesName as string | undefined,
					year: (suggestion.data.year as number) || new Date().getFullYear(),
					status: "draft",
					createdBy,
				});
				entityId = reimbursement.id;
				entityName = reimbursement.description || "Draft Reimbursement";
				break;
			}

			case "budget": {
				const budget = await db.createFundBudget({
					name: suggestion.name,
					description: suggestion.data.description as string | undefined,
					amount: String(suggestion.data.amount || "0"),
					year: (suggestion.data.year as number) || new Date().getFullYear(),
					status: "draft",
					createdBy,
				});
				entityId = budget.id;
				entityName = budget.name;
				break;
			}

			case "news": {
				const news = await db.createNews({
					title: suggestion.name,
					content: String(suggestion.data.content || ""),
					summary: suggestion.data.summary as string | undefined,
					createdBy,
				});
				entityId = news.id;
				entityName = news.title;
				break;
			}

			case "faq": {
				const faq = await db.createFaq({
					question: suggestion.name,
					answer: String(suggestion.data.answer || ""),
				});
				entityId = faq.id;
				entityName = faq.question;
				break;
			}

			default:
				throw new Error(
					`Unsupported entity type for draft creation: ${suggestion.entityType}`,
				);
		}

		// Create the relationship link
		const relationship: NewEntityRelationship = {
			relationAType: sourceType,
			relationId: sourceId,
			relationBType: suggestion.entityType,
			relationBId: entityId,
			metadata: JSON.stringify({
				ai_created: true,
				confidence: suggestion.confidence,
				reasoning: suggestion.reasoning,
				...suggestion.metadata,
			}),
			createdBy,
		};

		await db.createEntityRelationship(relationship);

		return { type: suggestion.entityType, id: entityId, name: entityName };
	} catch (error) {
		console.error(
			`[Analyzer] Failed to create draft ${suggestion.entityType}:`,
			error,
		);
		throw error;
	}
}

// ============================================
// RECEIPT ANALYZER
// ============================================

export async function analyzeReceipt(
	db: DatabaseAdapter,
	receiptId: string,
	createdBy: string,
): Promise<AnalysisResult> {
	const result: AnalysisResult = { success: true, created: [], errors: [] };

	try {
		// Load receipt
		const receipt = await db.getReceiptById(receiptId);
		if (!receipt) {
			throw new Error("Receipt not found");
		}

		if (!receipt.ocrProcessed) {
			throw new Error("Receipt has not been processed - run OCR first");
		}

		// Build analysis context from receipt fields
		const context: AnalysisContext = {
			description: receipt.storeName,
			totalAmount: receipt.totalAmount ? Number(receipt.totalAmount) : null,
			date: receipt.purchaseDate,
			currency: receipt.currency || "EUR",
			lineItems: receipt.items ? JSON.parse(receipt.items) : [],
		};

		// Get AI suggestions
		const openrouter = await getOpenRouter(db);

		const prompt = `You are a financial assistant analyzing a receipt to suggest related business entities.

RECEIPT DATA:
Store: ${context.description || "Unknown"}
Total: ${context.totalAmount} ${context.currency}
Date: ${context.date?.toISOString().split("T")[0] || "Unknown"}
${context.lineItems?.length ? `Items:\n${context.lineItems.map((i: any) => `- ${i.quantity}x ${i.name || i.description} (${i.totalPrice || i.price}€)`).join("\n")}` : ""}

Based on this receipt, suggest entities to create:

1. TRANSACTION (expense): Should always be created. Suggest category.
2. INVENTORY ITEMS: For durable goods/equipment (tools, electronics, furniture). Skip consumables (food, office supplies).
3. REIMBURSEMENT: Only if this looks like a purchase that needs reimbursement.

Respond with JSON:
{
  "suggestions": [
    {
      "entityType": "transaction|inventory|reimbursement",
      "name": "Display name",
      "data": { /* entity fields */ },
      "confidence": 0.0-1.0,
      "reasoning": "Why this entity should be created"
    }
  ]
}

Rules:
- Always suggest a transaction (expense)
- For inventory: only items >20€ that are durable (electronics, tools, equipment)
- Skip consumables like food, drinks, paper
- Confidence < 0.7 means skip the suggestion`;

		const { text } = await generateText({
			model: openrouter("google/gemini-flash-1.5"),
			prompt,
			temperature: 0.1,
		});

		if (!text) {
			throw new Error("AI returned empty response");
		}

		// Parse suggestions
		let suggestions: SuggestedEntity[] = [];
		try {
			const parsed = JSON.parse(text);
			suggestions = (parsed.suggestions || [])
				.filter((s: SuggestedEntity) => s.confidence >= 0.7)
				.map((s: SuggestedEntity) => ({
					...s,
					// Enrich data with receipt context
					data: {
						...s.data,
						date: s.data.date || context.date?.toISOString(),
						amount: s.data.amount || context.totalAmount,
						description: s.data.description || context.description,
					},
				}));
		} catch (e) {
			throw new Error(`Failed to parse AI response: ${e}`);
		}

		// Create draft entities for each suggestion
		for (const suggestion of suggestions) {
			try {
				const created = await createDraftEntity(
					db,
					"receipt",
					receiptId,
					suggestion,
					createdBy,
				);
				if (created) {
					result.created.push(created);
				}
			} catch (error) {
				result.errors.push(
					`Failed to create ${suggestion.entityType}: ${error}`,
				);
			}
		}
	} catch (error) {
		result.success = false;
		result.errors.push(error instanceof Error ? error.message : String(error));
	}

	return result;
}

// ============================================
// REIMBURSEMENT ANALYZER
// ============================================

export async function analyzeReimbursement(
	db: DatabaseAdapter,
	reimbursementId: string,
	createdBy: string,
): Promise<AnalysisResult> {
	const result: AnalysisResult = { success: true, created: [], errors: [] };

	try {
		const reimbursement = await db.getPurchaseById(reimbursementId);
		if (!reimbursement) {
			throw new Error("Reimbursement not found");
		}

		// Get linked receipts via entity relationships
		const relationships = await db.getEntityRelationships(
			"reimbursement",
			reimbursementId,
		);
		const receiptIds = relationships
			.filter(
				(r) => r.relationBType === "receipt" || r.relationAType === "receipt",
			)
			.map((r) =>
				r.relationBType === "receipt" ? r.relationBId : r.relationId,
			);
		const receipts =
			receiptIds.length > 0
				? await Promise.all(receiptIds.map((id) => db.getReceiptById(id))).then(
						(rs) => rs.filter((r): r is NonNullable<typeof r> => r !== null),
					)
				: [];

		// Build context from reimbursement + linked receipts
		const _context: AnalysisContext = {
			description: reimbursement.description,
			totalAmount: reimbursement.amount ? Number(reimbursement.amount) : null,
			date: reimbursement.createdAt,
		};

		// If there are linked receipts, analyze them for inventory items
		if (receipts.length > 0) {
			for (const receipt of receipts) {
				if (receipt.items) {
					const items = JSON.parse(receipt.items);
					// Suggest inventory items from durable goods
					for (const item of items) {
						const price = item.totalPrice || item.price || 0;
						// Heuristic: items over 20€ that look like durable goods
						if (price >= 20) {
							const name = (item.name || item.description || "").toLowerCase();
							const durableKeywords = [
								"tool",
								"equipment",
								"electronic",
								"cable",
								"adapter",
								"device",
								"monitor",
								"keyboard",
								"mouse",
								"chair",
								"desk",
							];
							const isDurable = durableKeywords.some((kw) => name.includes(kw));

							if (isDurable) {
								const suggestion: SuggestedEntity = {
									entityType: "inventory",
									name: item.name || item.description || "Inventory Item",
									data: {
										value: String(price),
										quantity: item.quantity || 1,
										purchasedAt:
											receipt.purchaseDate?.toISOString() ||
											new Date().toISOString(),
										description: `From receipt: ${receipt.storeName}`,
									},
									confidence: 0.8,
									reasoning: `Durable item (${price}€) from receipt`,
								};

								try {
									const created = await createDraftEntity(
										db,
										"reimbursement",
										reimbursementId,
										suggestion,
										createdBy,
									);
									if (created) {
										result.created.push(created);
									}
								} catch (error) {
									result.errors.push(
										`Failed to create inventory item: ${error}`,
									);
								}
							}
						}
					}
				}
			}
		}

		// Always suggest a transaction if none exists
		const existingRelationships = await db.getEntityRelationships(
			"reimbursement",
			reimbursementId,
		);
		const hasTransaction = existingRelationships.some(
			(r) =>
				r.relationBType === "transaction" || r.relationAType === "transaction",
		);
		if (!hasTransaction) {
			const transactionSuggestion: SuggestedEntity = {
				entityType: "transaction",
				name: `Transaction: ${reimbursement.description || "Reimbursement"}`,
				data: {
					type: "expense",
					amount: String(reimbursement.amount),
					description: reimbursement.description || "Reimbursement",
					date:
						reimbursement.createdAt?.toISOString() || new Date().toISOString(),
					category: "other",
				},
				confidence: 0.95,
				reasoning:
					"Every reimbursement needs a corresponding expense transaction",
			};

			try {
				const created = await createDraftEntity(
					db,
					"reimbursement",
					reimbursementId,
					transactionSuggestion,
					createdBy,
				);
				if (created) {
					result.created.push(created);
				}
			} catch (error) {
				result.errors.push(`Failed to create transaction: ${error}`);
			}
		}
	} catch (error) {
		result.success = false;
		result.errors.push(error instanceof Error ? error.message : String(error));
	}

	return result;
}

// ============================================
// TRANSACTION ANALYZER
// ============================================

export async function analyzeTransaction(
	db: DatabaseAdapter,
	transactionId: string,
	createdBy: string,
): Promise<AnalysisResult> {
	const result: AnalysisResult = { success: true, created: [], errors: [] };

	try {
		const transaction = await db.getTransactionById(transactionId);
		if (!transaction) {
			throw new Error("Transaction not found");
		}

		// Get AI suggestions for budget matching
		const openrouter = await getOpenRouter(db);

		// Load open budgets for the year
		const budgets = await db.getOpenFundBudgetsByYear(transaction.year);

		if (budgets.length > 0) {
			const prompt = `You are a financial assistant. Match this transaction to a budget if appropriate.

TRANSACTION:
Description: ${transaction.description}
Amount: ${transaction.amount}€
Type: ${transaction.type}

OPEN BUDGETS:
${budgets.map((b) => `- ${b.name}: ${b.amount}€ (${b.description || "No description"})`).join("\n")}

Should this transaction be linked to a budget? Respond with JSON:
{
  "shouldLink": true|false,
  "budgetId": "uuid or null",
  "confidence": 0.0-1.0,
  "reasoning": "explanation"
}

Link only if the transaction description clearly matches the budget purpose.`;

			const { text } = await generateText({
				model: openrouter("google/gemini-flash-1.5"),
				prompt,
				temperature: 0.1,
			});

			if (text) {
				try {
					const parsed = JSON.parse(text);
					if (
						parsed.shouldLink &&
						parsed.budgetId &&
						parsed.confidence >= 0.7
					) {
						const budget = budgets.find((b) => b.id === parsed.budgetId);
						if (budget) {
							// Create relationship to budget
							await db.createEntityRelationship({
								relationAType: "transaction",
								relationId: transactionId,
								relationBType: "budget",
								relationBId: budget.id,
								metadata: JSON.stringify({
									ai_created: true,
									confidence: parsed.confidence,
									reasoning: parsed.reasoning,
									amount: transaction.amount,
								}),
								createdBy,
							});

							result.created.push({
								type: "budget",
								id: budget.id,
								name: budget.name,
							});
						}
					}
				} catch (e) {
					console.error("Failed to parse budget matching response:", e);
				}
			}
		}
	} catch (error) {
		result.success = false;
		result.errors.push(error instanceof Error ? error.message : String(error));
	}

	return result;
}

// ============================================
// MINUTE ANALYZER
// ============================================

export async function analyzeMinute(
	db: DatabaseAdapter,
	minuteId: string,
	createdBy: string,
): Promise<AnalysisResult> {
	const result: AnalysisResult = { success: true, created: [], errors: [] };

	try {
		const minute = await db.getMinuteById(minuteId);
		if (!minute) {
			throw new Error("Minute not found");
		}

		// Minutes need file content analysis - this is a placeholder
		// In a full implementation, we'd extract text from the PDF/file
		// and analyze it for news-worthy content or FAQ items

		// For now, suggest creating a news item if the minute has a title
		if (minute.title && minute.title.length > 0) {
			// This is a simplified heuristic - in production you'd analyze the content
			const newsSuggestion: SuggestedEntity = {
				entityType: "news",
				name: `News: ${minute.title}`,
				data: {
					title: minute.title,
					content: `From meeting minutes dated ${minute.date?.toLocaleDateString() || "Unknown"}.`,
					summary: minute.description,
				},
				confidence: 0.6, // Lower confidence - requires user review
				reasoning: "Meeting minutes may contain news-worthy decisions",
			};

			try {
				const created = await createDraftEntity(
					db,
					"minute",
					minuteId,
					newsSuggestion,
					createdBy,
				);
				if (created) {
					result.created.push(created);
				}
			} catch (error) {
				result.errors.push(`Failed to create news item: ${error}`);
			}
		}
	} catch (error) {
		result.success = false;
		result.errors.push(error instanceof Error ? error.message : String(error));
	}

	return result;
}
