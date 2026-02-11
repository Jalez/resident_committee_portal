import { getDatabase } from "~/db";
import type { RelationshipEntityType } from "~/db/schema";
import {
	type AIEnrichmentResult,
	analyzeRelationshipContext,
} from "~/lib/ai/relationship-analyzer.server";
import { requireAnyPermission } from "~/lib/auth.server";
import type { RelationshipContext } from "~/lib/linking/relationship-context.server";
import {
	getRelationshipContext,
	type RelationshipContextValues,
} from "~/lib/relationships/relationship-context.server";
import type { Route } from "./+types/_index";

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
		],
		getDatabase,
	);
	const db = getDatabase();

	const formData = await request.formData();
	const entityType = formData.get(
		"entityType",
	) as RelationshipEntityType | null;
	const entityId = formData.get("entityId") as string | null;
	const useAI = formData.get("useAI") === "true";

	if (!entityType || !entityId) {
		return Response.json(
			{ error: "entityType and entityId are required" },
			{ status: 400 },
		);
	}

	// Parse current form values (so we know which fields need filling)
	const currentValuesStr = formData.get("currentValues") as string | null;
	let currentValues: Record<string, string> = {};
	if (currentValuesStr) {
		try {
			currentValues = JSON.parse(currentValuesStr);
		} catch {
			// ignore parse errors
		}
	}

	// 1. Get deterministic relationship context
	const contextValues = await getRelationshipContext(db, entityType, entityId);

	// 2. Build suggestions based on entity type field mapping
	const fieldMap = ENTITY_FIELD_MAPS[entityType] || {};
	const suggestions: Record<string, string | number | null> = {};

	for (const [formField, contextField] of Object.entries(fieldMap)) {
		const contextValue = contextValues[contextField];
		if (contextValue === null || contextValue === undefined) continue;

		// Only suggest if the current value is empty/default
		const currentVal = currentValues[formField];
		const isEmpty =
			!currentVal ||
			currentVal === "" ||
			currentVal === "0" ||
			currentVal === "0.00" ||
			currentVal === "0,00";

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

	// 3. Optionally enhance with AI
	let aiResult: AIEnrichmentResult | null = null;
	if (useAI && contextValues.valueSource) {
		try {
			// Convert new context to old format for the analyzer
			const legacyContext: RelationshipContext = {
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

			// Merge AI suggestions into suggestions (only for empty fields)
			if (aiResult) {
				const categoryField = Object.entries(fieldMap).find(
					([, v]) => v === "category",
				)?.[0];
				const descriptionField = Object.entries(fieldMap).find(
					([, v]) => v === "description",
				)?.[0];

				if (
					categoryField &&
					aiResult.suggestedCategory &&
					!suggestions[categoryField]
				) {
					const currentCat = currentValues[categoryField];
					if (!currentCat || currentCat === "") {
						suggestions[categoryField] = aiResult.suggestedCategory;
					}
				}

				if (
					descriptionField &&
					aiResult.suggestedDescription &&
					!suggestions[descriptionField]
				) {
					const currentDesc = currentValues[descriptionField];
					if (!currentDesc || currentDesc === "") {
						suggestions[descriptionField] = aiResult.suggestedDescription;
					}
				}
			}
		} catch (error) {
			console.error("[SmartAutofill] AI analysis failed:", error);
		}
	}

	const result: SmartAutofillSuggestions = {
		context: contextValues,
		ai: aiResult
			? {
					suggestedCategory: aiResult.suggestedCategory,
					suggestedDescription: aiResult.suggestedDescription,
					reasoning: aiResult.reasoning,
					tags: aiResult.tags,
				}
			: null,
		suggestions,
	};

	return Response.json(result);
}
