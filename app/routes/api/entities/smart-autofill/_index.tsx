import { getDatabase } from "~/db/server";

import {
	type AIEnrichmentResult,
	analyzeRelationshipContext,
} from "~/lib/ai/relationship-analyzer.server";
import { requireAnyPermission } from "~/lib/auth.server";
import {
	getRelationshipContext,
	type RelationshipContextValues,
} from "~/lib/relationships/relationship-context.server";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import { translateNews, translateFaq } from "~/lib/translate.server";
import type { Route } from "./+types/_index";
import type { RelationshipEntityType } from "~/db";

interface LegacyContext {
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
	valueSource: "manual" | "receipt" | "reimbursement" | "transaction" | "unknown";
	linkedEntityIds: string[];
}

/**
 * Smart Autofill suggestions returned to the client.
 * Each field is optional — only fields with suggestions are returned.
 */
export interface SmartAutofillSuggestions {
	/** Deterministic values from relationship context */
	context: RelationshipContextValues | null;
	/** AI-enhanced suggestions (if requested and available) */
	ai: {
		suggestedCategory: string | null;
		suggestedDescription: string | null;
		reasoning: string | null;
		tags: string[];
	} | null;
	/** Merged field suggestions ready to apply */
	suggestions: Record<string, string | number | null>;
}

/**
 * Entity field mapping — maps context fields to entity form fields
 */
const ENTITY_FIELD_MAPS: Record<
	string,
	Record<string, keyof RelationshipContextValues>
> = {
	transaction: {
		amount: "totalAmount",
		description: "description",
		date: "date",
		category: "category",
	},
	reimbursement: {
		amount: "totalAmount",
		description: "description",
	},
	budget: {
		amount: "totalAmount",
		name: "description",
	},
	inventory: {
		value: "totalAmount",
		name: "description",
		category: "category",
		purchasedAt: "date",
	},
	receipt: {
		// Receipt is highest priority — it provides values, doesn't consume them
	},
};

export async function action({ request }: Route.ActionArgs) {
	await requireAnyPermission(
		request,
		[
			"treasury:transactions:update",
			"treasury:budgets:update",
			"treasury:reimbursements:update",
			"inventory:write",
			"news:update",
			"faq:update",
		],
		getDatabase,
	);
	const db = getDatabase();

	const formData = await request.formData();
	const entityType = formData.get(
		"entityType",
	) as string | null;
	const entityId = formData.get("entityId") as string | null;
	const useAI = formData.get("useAI") === "true";
	const localModel = formData.get("localModel") as string | null;
	const sourceLanguage = formData.get("sourceLanguage") as string | null;
	const targetLanguage = formData.get("targetLanguage") as string | null;

	if (!entityType || !entityId) {
		return Response.json(
			{ error: "entityType and entityId are required" },
			{ status: 400 },
		);
	}

	// Parse current form values
	const currentValuesStr = formData.get("currentValues") as string | null;
	let currentValues: Record<string, string> = {};
	if (currentValuesStr) {
		try {
			currentValues = JSON.parse(currentValuesStr);
		} catch {
			// ignore parse errors
		}
	}

	// 1. Get deterministic relationship context (for financial entities)
	let contextValues: RelationshipContextValues | null = null;
	const finEntities: string[] = ["transaction", "reimbursement", "budget", "inventory"];
	if (finEntities.includes(entityType)) {
		contextValues = await getRelationshipContext(db, entityType as RelationshipEntityType, entityId);
	}

	// 2. Build suggestions based on entity type field mapping
	const fieldMap = ENTITY_FIELD_MAPS[entityType] || {};
	const suggestions: Record<string, string | number | null> = {};

	if (contextValues) {
		for (const [formField, contextField] of Object.entries(fieldMap)) {
			const contextValue = contextValues[contextField];
			if (contextValue === null || contextValue === undefined) continue;

			const currentVal = currentValues[formField];
			const isEmpty = !currentVal || currentVal === "" || currentVal === "0" || currentVal === "0.00" || currentVal === "0,00";

			if (isEmpty) {
				if (contextField === "date" && contextValue instanceof Date) {
					suggestions[formField] = contextValue.toISOString().split("T")[0];
				} else if (contextField === "totalAmount") {
					suggestions[formField] = Number(contextValue);
				} else {
					suggestions[formField] = String(contextValue);
				}
			}
		}
	}

	// 3. AI Enrichment / Translation
	let aiResult: AIEnrichmentResult | null = null;

	// If it's a multi-language entity and we want AI translation (and it's not a local model - local should be handled on client ideally)
	if (useAI && !localModel && (entityType === "news" || entityType === "faq")) {
		// Server-side AI translation using OpenRouter (as an alternative to local model)
		// How do we decide which direction to translate? 
		// Usually from primary to secondary if secondary is empty.
		const fieldsToTranslate = entityType === "news"
			? ["title", "summary", "content"]
			: ["question", "answer"];

		const apiKey = await db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY);
		const model = await db.getSetting(entityType === "news" ? SETTINGS_KEYS.NEWS_AI_MODEL : SETTINGS_KEYS.FAQ_AI_MODEL);

		if (apiKey && model) {
			const sourceVals: Record<string, string> = {};
			for (const f of fieldsToTranslate) {
				if (currentValues[f]) sourceVals[f] = currentValues[f];
			}

			if (Object.keys(sourceVals).length > 0) {
				try {
					// We reuse the existing translation server logic
					const translateFn = entityType === "news" ? translateNews : translateFaq;
					const result = await translateFn(
						sourceVals as any,
						sourceLanguage || "Source",
						targetLanguage || "Target",
						apiKey,
						model
					);

					// Apply translated values to secondary fields if they are empty
					for (const [key, val] of Object.entries(result as Record<string, any>)) {
						const secondaryKey = `${key}Secondary`;
						if (!currentValues[secondaryKey]) {
							suggestions[secondaryKey] = val as string;
						}
					}
				} catch (err) {
					console.error("[SmartAutofill] Server-side translation failed:", err);
				}
			}
		}
	} else if (useAI && !localModel && contextValues?.valueSource) {
		try {
			const legacyContext: LegacyContext = {
				id: `smart-autofill-${entityId}`,
				date: contextValues.date,
				totalAmount: contextValues.totalAmount,
				description: contextValues.description,
				currency: contextValues.currency,
				category: contextValues.category,
				purchaserId: contextValues.purchaserId,
				lineItems: contextValues.lineItems,
				valueSource: contextValues.valueSource || "unknown",
				linkedEntityIds: [],
			};

			aiResult = await analyzeRelationshipContext(db, legacyContext);

			if (aiResult) {
				const categoryField = Object.entries(fieldMap).find(([, v]) => v === "category")?.[0];
				const descriptionField = Object.entries(fieldMap).find(([, v]) => v === "description")?.[0];

				if (categoryField && aiResult.suggestedCategory && !suggestions[categoryField]) {
					if (!currentValues[categoryField]) suggestions[categoryField] = aiResult.suggestedCategory;
				}
				if (descriptionField && aiResult.suggestedDescription && !suggestions[descriptionField]) {
					if (!currentValues[descriptionField]) suggestions[descriptionField] = aiResult.suggestedDescription;
				}
			}
		} catch (error) {
			console.error("[SmartAutofill] AI analysis failed:", error);
		}
	}

	const resp: SmartAutofillSuggestions = {
		context: contextValues,
		ai: aiResult ? {
			suggestedCategory: aiResult.suggestedCategory,
			suggestedDescription: aiResult.suggestedDescription,
			reasoning: aiResult.reasoning,
			tags: aiResult.tags,
		} : null,
		suggestions,
	};

	return Response.json(resp);
}
