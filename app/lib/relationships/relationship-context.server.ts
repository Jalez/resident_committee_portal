/**
 * Relationship Context & Domination Scale
 *
 * Implements the priority-based value resolution system for linked entities.
 * When multiple entities are linked (Receipt, Transaction, Reimbursement, etc.),
 * this determines which entity's values should be used as the "source of truth"
 * for shared fields like date, amount, and description.
 *
 * Priority Scale (Domination):
 * 0. Manual (Ultimate) - User explicitly sets a value
 * 1. Receipt (High) - Physical proof with immutable facts
 * 2. Reimbursement (Medium) - User's intent and logical grouping
 * 3. Transaction (Low) - Bank record, lacks context
 *
 * See: TODO-relationship_context_design.md for full specification
 */

import type { getDatabase } from "~/db/server.server";
import type { RelationshipEntityType } from "~/db/types";

export interface RelationshipContextValues {
	/** Source date (when the event occurred) */
	date: Date | null;
	/** Total amount in decimal */
	totalAmount: number | null;
	/** Description/title of the transaction/purchase */
	description: string | null;
	/** Currency code (e.g., "EUR") */
	currency: string | null;
	/** Category classification */
	category: string | null;
	/** User who made the purchase */
	purchaserId: string | null;
	/** Line items (for receipts with itemized content) */
	lineItems: Array<{
		name: string;
		quantity: number;
		unitPrice: number;
		totalPrice: number;
		tags?: string[];
		sourceItemId?: string;
	}>;
	/** Which entity type provided these values */
	valueSource: "manual" | "receipt" | "reimbursement" | "transaction" | null;
}

/**
 * Priority levels for the domination scale.
 * Higher number = higher priority.
 */
const PRIORITY_LEVELS: Record<RelationshipEntityType | "manual", number> = {
	manual: 4, // Ultimate priority - user knows best
	receipt: 3, // High - physical proof
	reimbursement: 2, // Medium - logical grouping
	transaction: 1, // Low - just a bank record
	budget: 0,
	inventory: 0,
	minute: 0,
	news: 0,
	faq: 0,
	poll: 0,
	social: 0,
	event: 0,
	mail: 0,
};

/**
 * Determine the relationship context values for an entity based on its linked entities.
 *
 * This function:
 * 1. Fetches all linked entities
 * 2. Determines which has the highest priority
 * 3. Extracts values from that entity
 * 4. Returns a context object with the "truth" values
 *
 * @param db - Database adapter
 * @param entityType - Type of the source entity
 * @param entityId - ID of the source entity (null if creating new)
 * @param manualOverrides - User-provided values that override everything
 * @returns Context values to use for the entity
 */
export async function getRelationshipContext(
	db: ReturnType<typeof getDatabase>,
	entityType: RelationshipEntityType,
	entityId: string | null,
	manualOverrides?: Partial<RelationshipContextValues>,
): Promise<RelationshipContextValues> {
	// Start with empty context
	const context: RelationshipContextValues = {
		date: null,
		totalAmount: null,
		description: null,
		currency: null,
		category: null,
		purchaserId: null,
		lineItems: [],
		valueSource: null,
	};

	// If no entity ID, we're creating a new entity - use only manual overrides
	if (!entityId) {
		return applyManualOverrides(context, manualOverrides);
	}

	// Fetch linked entities
	const relationships = await db.getEntityRelationships(entityType, entityId);

	if (relationships.length === 0) {
		// No linked entities, use only manual overrides
		return applyManualOverrides(context, manualOverrides);
	}

	// Determine the highest priority source
	let highestPriority = -1;
	let dominantEntityType: RelationshipEntityType | null = null;
	let dominantEntityId: string | null = null;

	for (const rel of relationships) {
		// Determine which entity is the "other" one (not our source entity)
		const otherType =
			rel.relationAType === entityType && rel.relationId === entityId
				? rel.relationBType
				: rel.relationAType;
		const otherId =
			rel.relationAType === entityType && rel.relationId === entityId
				? rel.relationBId
				: rel.relationId;

		const priority = PRIORITY_LEVELS[otherType] || 0;

		if (priority > highestPriority) {
			highestPriority = priority;
			dominantEntityType = otherType;
			dominantEntityId = otherId;
		}
	}

	// Extract values from the dominant entity
	if (dominantEntityType && dominantEntityId) {
		await populateContextFromEntity(
			db,
			context,
			dominantEntityType,
			dominantEntityId,
		);
	}

	// Apply manual overrides (ultimate priority)
	return applyManualOverrides(context, manualOverrides);
}

/**
 * Populate context values from a specific entity
 */
async function populateContextFromEntity(
	db: ReturnType<typeof getDatabase>,
	context: RelationshipContextValues,
	entityType: RelationshipEntityType,
	entityId: string,
): Promise<void> {
	try {
		switch (entityType) {
			case "receipt": {
				const receipt = await db.getReceiptById(entityId);
				if (receipt) {
					context.date = receipt.purchaseDate;
					context.totalAmount = receipt.totalAmount
						? Number(receipt.totalAmount)
						: null;
					context.description = receipt.storeName;
					context.currency = receipt.currency || "EUR";
					context.purchaserId = receipt.createdBy;
					context.valueSource = "receipt";

					// Parse line items from receipt
					if (receipt.items) {
						try {
							const items =
								typeof receipt.items === "string"
									? JSON.parse(receipt.items)
									: receipt.items;
							context.lineItems = (items || []).map((item: any) => ({
								name: item.name || item.description || "",
								quantity: item.quantity || 1,
								unitPrice: item.price || 0,
								totalPrice: item.total || item.price || 0,
								sourceItemId: item.id,
							}));
						} catch {
							context.lineItems = [];
						}
					}
				}
				break;
			}

			case "reimbursement": {
				const reimbursement = await db.getPurchaseById(entityId);
				if (reimbursement) {
					// Reimbursements don't have a purchaseDate field, only createdAt
					context.date = reimbursement.createdAt;
					context.totalAmount = reimbursement.amount
						? Number(reimbursement.amount)
						: null;
					context.description = reimbursement.description;
					context.currency = "EUR"; // Reimbursements are typically in EUR
					context.purchaserId = reimbursement.createdBy;
					context.valueSource = "reimbursement";
				}
				break;
			}

			case "transaction": {
				const transaction = await db.getTransactionById(entityId);
				if (transaction) {
					context.date = transaction.date;
					context.totalAmount = transaction.amount
						? Number(transaction.amount)
						: null;
					context.description = transaction.description;
					context.currency = "EUR";
					context.valueSource = "transaction";
				}
				break;
			}

			// Other entity types don't contribute to context values
			default:
				break;
		}
	} catch (error) {
		console.error(
			`[RelationshipContext] Failed to populate from ${entityType}:`,
			error,
		);
	}
}

/**
 * Apply manual overrides to the context (ultimate priority)
 */
function applyManualOverrides(
	context: RelationshipContextValues,
	overrides?: Partial<RelationshipContextValues>,
): RelationshipContextValues {
	if (!overrides) {
		return context;
	}

	const result = { ...context };

	if (overrides.date !== undefined) {
		result.date = overrides.date;
		result.valueSource = "manual";
	}
	if (overrides.totalAmount !== undefined) {
		result.totalAmount = overrides.totalAmount;
		result.valueSource = "manual";
	}
	if (overrides.description !== undefined) {
		result.description = overrides.description;
		result.valueSource = "manual";
	}
	if (overrides.currency !== undefined) {
		result.currency = overrides.currency;
	}
	if (overrides.category !== undefined) {
		result.category = overrides.category;
	}
	if (overrides.purchaserId !== undefined) {
		result.purchaserId = overrides.purchaserId;
	}
	if (overrides.lineItems !== undefined) {
		result.lineItems = overrides.lineItems;
	}

	return result;
}

/**
 * Get the priority level of an entity type.
 * Higher number = higher priority in the domination scale.
 */
export function getEntityPriority(
	entityType: RelationshipEntityType | "manual",
): number {
	return PRIORITY_LEVELS[entityType] || 0;
}

/**
 * Determine if entity A should override entity B's values
 * based on the domination scale.
 */
export function shouldOverride(
	sourceType: RelationshipEntityType | "manual",
	targetType: RelationshipEntityType | "manual",
): boolean {
	return getEntityPriority(sourceType) > getEntityPriority(targetType);
}
