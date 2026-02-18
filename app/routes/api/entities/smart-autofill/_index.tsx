import type { RelationshipEntityType } from "~/db";
import { getDatabase } from "~/db/server.server";
import {
	type AIEnrichmentResult,
	analyzeRelationshipContext,
} from "~/lib/ai/relationship-analyzer.server";
import { requireAnyPermission } from "~/lib/auth.server";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";
import {
	getRelationshipContext,
	type RelationshipContextValues,
} from "~/lib/relationships/relationship-context.server";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { translateFaq, translateNews } from "~/lib/translate.server";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";
import type { Route } from "./+types/_index";

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
	valueSource:
		| "manual"
		| "receipt"
		| "reimbursement"
		| "transaction"
		| "unknown";
	linkedEntityIds: string[];
}

interface PendingRelationshipChanges {
	links: Array<{
		relationBType: RelationshipEntityType;
		relationBId: string;
	}>;
	unlinks: Array<{
		relationBType: RelationshipEntityType;
		relationBId: string;
	}>;
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
	mail: {},
	transaction: {
		amount: "totalAmount",
		description: "description",
		date: "date",
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

function formatAmount(value: unknown): string {
	const numeric =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: Number.NaN;
	if (!Number.isFinite(numeric)) return "";
	return `${numeric.toFixed(2)} EUR`;
}

function toNonEmptyString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function getRelatedEntityFromRelationship(
	entityType: RelationshipEntityType,
	entityId: string,
	relationship: {
		relationAType: RelationshipEntityType;
		relationId: string;
		relationBType: RelationshipEntityType;
		relationBId: string;
	},
): { type: RelationshipEntityType; id: string } | null {
	if (
		relationship.relationAType === entityType &&
		relationship.relationId === entityId
	) {
		return { type: relationship.relationBType, id: relationship.relationBId };
	}
	if (
		relationship.relationBType === entityType &&
		relationship.relationBId === entityId
	) {
		return { type: relationship.relationAType, id: relationship.relationId };
	}
	return null;
}

async function expandLinkedRelationships(
	db: ReturnType<typeof getDatabase>,
	entityType: RelationshipEntityType,
	entityId: string,
	userId: string | null,
): Promise<number> {
	const directRelationships = await db.getEntityRelationships(entityType, entityId);
	const existingLinked = new Set<string>();
	const directLinkedEntities: Array<{ type: RelationshipEntityType; id: string }> =
		[];

	for (const relationship of directRelationships) {
		const related = getRelatedEntityFromRelationship(
			entityType,
			entityId,
			relationship,
		);
		if (!related) continue;
		if (related.type === entityType && related.id === entityId) continue;
		const key = `${related.type}:${related.id}`;
		if (!existingLinked.has(key)) {
			existingLinked.add(key);
			directLinkedEntities.push(related);
		}
	}

	let createdCount = 0;
	const processedCandidates = new Set<string>();

	for (const direct of directLinkedEntities) {
		const secondaryRelationships = await db.getEntityRelationships(
			direct.type,
			direct.id,
		);
		for (const relationship of secondaryRelationships) {
			const candidate = getRelatedEntityFromRelationship(
				direct.type,
				direct.id,
				relationship,
			);
			if (!candidate) continue;
			if (candidate.type === entityType && candidate.id === entityId) continue;

			const candidateKey = `${candidate.type}:${candidate.id}`;
			if (existingLinked.has(candidateKey)) continue;
			if (processedCandidates.has(candidateKey)) continue;
			processedCandidates.add(candidateKey);

			const exists = await db.entityRelationshipExists(
				entityType,
				entityId,
				candidate.type,
				candidate.id,
			);
			if (exists) {
				existingLinked.add(candidateKey);
				continue;
			}

			await db.createEntityRelationship({
				relationAType: entityType,
				relationId: entityId,
				relationBType: candidate.type,
				relationBId: candidate.id,
				createdBy: userId,
				metadata: null,
			});
			existingLinked.add(candidateKey);
			createdCount++;
		}
	}

	return createdCount;
}

async function getMailAutofillSuggestions(
	db: ReturnType<typeof getDatabase>,
	entityId: string,
	currentValues: Record<string, string>,
	userPermissions: string[],
	pendingChanges?: PendingRelationshipChanges,
): Promise<Record<string, string>> {
	const relationshipData = await loadRelationshipsForEntity(
		db,
		"mail",
		entityId,
		["reimbursement", "receipt", "minute"],
		{ userPermissions },
	);

	const reimbursements = (relationshipData.reimbursement?.linked ??
		[]) as Array<Record<string, unknown>>;
	const reimbursement = reimbursements[0];
	if (!reimbursement) return {};

	const reimbursementId = toNonEmptyString(reimbursement.id);
	const description =
		toNonEmptyString(reimbursement.description) || "Reimbursement";
	const purchaserName =
		toNonEmptyString(reimbursement.purchaserName) || "Not specified";
	const bankAccount =
		toNonEmptyString(reimbursement.bankAccount) || "Not specified";
	const notes = toNonEmptyString(reimbursement.notes);
	const amount = formatAmount(reimbursement.amount) || "Not specified";
	const reimbursementRecipientEmail =
		(await db.getSetting(SETTINGS_KEYS.REIMBURSEMENT_RECIPIENT_EMAIL))?.trim() ||
		(process.env.RECIPIENT_EMAIL || "").trim();

	const linkedMinutes = (relationshipData.minute?.linked ??
		[]) as Array<Record<string, unknown>>;
	const pendingMinuteIds = new Set(
		(pendingChanges?.links || [])
			.filter((l) => l.relationBType === "minute")
			.map((l) => l.relationBId),
	);
	const pendingMinuteUnlinks = new Set(
		(pendingChanges?.unlinks || [])
			.filter((u) => u.relationBType === "minute")
			.map((u) => u.relationBId),
	);
	const minuteMap = new Map<string, Record<string, unknown>>();
	for (const minute of linkedMinutes) {
		const id = toNonEmptyString(minute.id);
		if (!id || pendingMinuteUnlinks.has(id)) continue;
		minuteMap.set(id, minute);
	}
	for (const minuteId of pendingMinuteIds) {
		if (minuteMap.has(minuteId)) continue;
		const minute = await db.getMinuteById(minuteId);
		if (minute) {
			minuteMap.set(minuteId, minute as unknown as Record<string, unknown>);
		}
	}
	const minuteLabel =
		(() => {
			const primaryMinute = Array.from(minuteMap.values())[0];
			if (!primaryMinute) return "Not specified";
			return (
				toNonEmptyString(primaryMinute.title) ||
				toNonEmptyString(primaryMinute.name) ||
				toNonEmptyString(primaryMinute.description) ||
				toNonEmptyString(primaryMinute.fileKey) ||
				"Not specified"
			);
		})();

	const linkedReceipts = (relationshipData.receipt?.linked ??
		[]) as Array<Record<string, unknown>>;
	const pendingReceiptIds = new Set(
		(pendingChanges?.links || [])
			.filter((l) => l.relationBType === "receipt")
			.map((l) => l.relationBId),
	);
	const pendingReceiptUnlinks = new Set(
		(pendingChanges?.unlinks || [])
			.filter((u) => u.relationBType === "receipt")
			.map((u) => u.relationBId),
	);
	const receiptMap = new Map<string, Record<string, unknown>>();
	for (const receipt of linkedReceipts) {
		const id = toNonEmptyString(receipt.id);
		if (!id || pendingReceiptUnlinks.has(id)) continue;
		receiptMap.set(id, receipt);
	}
	for (const receiptId of pendingReceiptIds) {
		if (receiptMap.has(receiptId)) continue;
		const receipt = await db.getReceiptById(receiptId);
		if (receipt) {
			receiptMap.set(receiptId, receipt as unknown as Record<string, unknown>);
		}
	}
	const effectiveReceipts = Array.from(receiptMap.values());
	const receiptNames = effectiveReceipts
		.map(
			(receipt) =>
				toNonEmptyString(receipt.name) ||
				toNonEmptyString(receipt.description) ||
				toNonEmptyString(receipt.storeName) ||
				toNonEmptyString(receipt.pathname).split("/").pop() ||
				toNonEmptyString(receipt.id),
		)
		.filter(Boolean);
	const receiptLine =
		receiptNames.length > 0
			? `${receiptNames.join(", ")} (attached)`
			: effectiveReceipts.length > 0
				? `${effectiveReceipts.length} receipt(s) attached`
				: "Not specified";

	const suggestions: Record<string, string> = {};
	if (reimbursementRecipientEmail) {
		suggestions.toEmail = reimbursementRecipientEmail;
	}
	if (!currentValues.subject?.trim()) {
		suggestions.subject = `Reimbursement request: ${description} (${amount})`;
	}
	const currentBody = currentValues.body?.trim() || "";
	const isPreviouslyAutofilledTemplate =
		currentBody.includes("Please process the following reimbursement request:") &&
		currentBody.includes("Reimbursement ID:");
	if (!currentBody || isPreviouslyAutofilledTemplate) {
		suggestions.body = [
			"Hello,",
			"",
			"Please process the following reimbursement request:",
			`- Item: ${description}`,
			`- Amount: ${amount}`,
			`- Purchaser: ${purchaserName}`,
			`- Bank account: ${bankAccount}`,
			`- Minutes: ${minuteLabel} (attached if linked)`,
			`- Receipts: ${receiptLine}`,
			...(notes ? [`- Notes: ${notes}`] : []),
			"",
			`Reimbursement ID: ${reimbursementId || "Not specified"}`,
			"Please reply to this email with approval or rejection.",
		].join("\n");
	}

	return suggestions;
}

export async function action({ request }: Route.ActionArgs) {
	const authUser = await requireAnyPermission(
		request,
		[
			"committee:email",
			"treasury:transactions:update",
			"treasury:receipts:update",
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
	const entityType = formData.get("entityType") as string | null;
	const entityId = formData.get("entityId") as string | null;
	const useAI = formData.get("useAI") === "true";
	const localModel = formData.get("localModel") as string | null;
	const expandLinkedRelations = formData.get("expandLinkedRelations") !== "false";
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
	let pendingChanges: PendingRelationshipChanges = {
		links: [],
		unlinks: [],
	};
	try {
		const rawLinks = formData.get("_relationship_links");
		const rawUnlinks = formData.get("_relationship_unlinks");
		if (rawLinks) {
			pendingChanges.links = JSON.parse(String(rawLinks)) as PendingRelationshipChanges["links"];
		}
		if (rawUnlinks) {
			pendingChanges.unlinks = JSON.parse(
				String(rawUnlinks),
			) as PendingRelationshipChanges["unlinks"];
		}
	} catch (error) {
		console.error("[SmartAutofill] Failed to parse pending relationship changes:", error);
	}

	const relationshipEntityTypes: RelationshipEntityType[] = [
		"receipt",
		"transaction",
		"reimbursement",
		"budget",
		"inventory",
		"minute",
		"news",
		"faq",
		"poll",
		"social",
		"event",
		"mail",
	];
	const isRelationshipEntityType = relationshipEntityTypes.includes(
		entityType as RelationshipEntityType,
	);

	// For mail, persist pending relationship changes first so expansion and suggestions
	// include links added in the current unsaved edit state.
	if (entityType === "mail") {
		await saveRelationshipChanges(
			db,
			"mail",
			entityId,
			formData,
			authUser.userId || null,
			authUser.permissions,
		);
	}

	// Global smart-autofill behavior: optionally expand one-hop relationships
	// before generating any context-based suggestions.
	if (expandLinkedRelations && isRelationshipEntityType) {
		try {
			await expandLinkedRelationships(
				db,
				entityType as RelationshipEntityType,
				entityId,
				authUser.userId || null,
			);
		} catch (error) {
			console.error("[SmartAutofill] Failed to expand linked relationships:", error);
		}
	}

	// 1. Get deterministic relationship context (for financial entities)
	let contextValues: RelationshipContextValues | null = null;
	const finEntities: string[] = [
		"transaction",
		"reimbursement",
		"budget",
		"inventory",
	];
	if (finEntities.includes(entityType)) {
		contextValues = await getRelationshipContext(
			db,
			entityType as RelationshipEntityType,
			entityId,
		);
	}

	// 2. Build suggestions based on entity type field mapping
	const fieldMap = ENTITY_FIELD_MAPS[entityType] || {};
	const suggestions: Record<string, string | number | null> = {};
	const isEmptyValue = (value: string | undefined) =>
		!value || value.trim() === "";

	if (entityType === "mail") {
		const mailSuggestions = await getMailAutofillSuggestions(
			db,
			entityId,
			currentValues,
			authUser.permissions,
			pendingChanges,
		);
		Object.assign(suggestions, mailSuggestions);
		const resp: SmartAutofillSuggestions = {
			context: null,
			ai: null,
			suggestions,
		};
		return Response.json(resp);
	}

	if (entityType === "receipt") {
		const receipt = await db.getReceiptById(entityId);

		if (receipt) {
			const currentName = currentValues.name;
			const currentDescription = currentValues.description;

			if (isEmptyValue(currentName)) {
				if (receipt.storeName?.trim()) {
					suggestions.name = receipt.storeName.trim();
				} else if (receipt.pathname) {
					const filename = receipt.pathname.split("/").pop();
					if (filename) {
						suggestions.name = filename.replace(/\.[^.]+$/, "");
					}
				}
			}

			if (isEmptyValue(currentDescription)) {
				const descriptionParts: string[] = [];
				if (receipt.totalAmount) {
					descriptionParts.push(
						`${receipt.totalAmount} ${receipt.currency || "EUR"}`,
					);
				}
				if (receipt.purchaseDate) {
					descriptionParts.push(
						new Date(receipt.purchaseDate).toISOString().split("T")[0],
					);
				}
				if (descriptionParts.length > 0) {
					suggestions.description = descriptionParts.join(" • ");
				}
			}
		}
	}

	if (entityType === "reimbursement" && authUser.userId !== "guest") {
		const profileUser = await db.findUserById(authUser.userId);
		if (profileUser) {
			const currentPurchaserName = currentValues.purchaserName;
			const currentBankAccount = currentValues.bankAccount;

			if (isEmptyValue(currentPurchaserName) && profileUser.name?.trim()) {
				suggestions.purchaserName = profileUser.name.trim();
			}
			if (isEmptyValue(currentBankAccount) && profileUser.bankAccount?.trim()) {
				suggestions.bankAccount = profileUser.bankAccount.trim();
			}
		}
	}

	if (contextValues) {
		for (const [formField, contextField] of Object.entries(fieldMap)) {
			const contextValue = contextValues[contextField];
			if (contextValue === null || contextValue === undefined) continue;

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
	}

	// 3. AI Enrichment / Translation
	let aiResult: AIEnrichmentResult | null = null;

	// If it's a multi-language entity and we want AI translation (and it's not a local model - local should be handled on client ideally)
	if (useAI && !localModel && (entityType === "news" || entityType === "faq")) {
		// Server-side AI translation using OpenRouter (as an alternative to local model)
		// How do we decide which direction to translate?
		// Usually from primary to secondary if secondary is empty.
		const fieldsToTranslate =
			entityType === "news"
				? ["title", "summary", "content"]
				: ["question", "answer"];

		const apiKey = await db.getSetting(SETTINGS_KEYS.OPENROUTER_API_KEY);
		const model = await db.getSetting(
			entityType === "news"
				? SETTINGS_KEYS.NEWS_AI_MODEL
				: SETTINGS_KEYS.FAQ_AI_MODEL,
		);

		if (apiKey && model) {
			const sourceVals: Record<string, string> = {};
			for (const f of fieldsToTranslate) {
				if (currentValues[f]) sourceVals[f] = currentValues[f];
			}

			if (Object.keys(sourceVals).length > 0) {
				try {
					// We reuse the existing translation server logic
					const translateFn =
						entityType === "news" ? translateNews : translateFaq;
					const result = await translateFn(
						sourceVals as any,
						sourceLanguage || "Source",
						targetLanguage || "Target",
						apiKey,
						model,
					);

					// Apply translated values to secondary fields if they are empty
					for (const [key, val] of Object.entries(
						result as Record<string, any>,
					)) {
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
					if (!currentValues[categoryField])
						suggestions[categoryField] = aiResult.suggestedCategory;
				}
				if (
					descriptionField &&
					aiResult.suggestedDescription &&
					!suggestions[descriptionField]
				) {
					if (!currentValues[descriptionField])
						suggestions[descriptionField] = aiResult.suggestedDescription;
				}
			}
		} catch (error) {
			console.error("[SmartAutofill] AI analysis failed:", error);
		}
	}

	const resp: SmartAutofillSuggestions = {
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

	return Response.json(resp);
}
