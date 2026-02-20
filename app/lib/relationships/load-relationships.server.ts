/**
 * Server-side utilities for loading relationship data for entities.
 *
 * Queries the universal entity_relationships table and fetches related entities,
 * providing data ready for the RelationshipPicker component.
 */

import type { getDatabase } from "~/db/server.server";
import type { RelationshipEntityType } from "~/db/types";
import {
	canReadRelationType,
	canWriteRelationType,
} from "./permissions.server";

interface RelationshipData<T = unknown> {
	linked: T[];
	available: T[];
	canWrite: boolean;
}

const VALID_RELATIONSHIP_TYPES: RelationshipEntityType[] = [
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
	"mail",
	"event",
];

const LEGACY_TYPE_ALIASES: Record<string, RelationshipEntityType> = {
	purchase: "reimbursement",
	purchases: "reimbursement",
	minutes: "minute",
	transactions: "transaction",
	receipts: "receipt",
	budgets: "budget",
	inventories: "inventory",
	inventory_items: "inventory",
	faqs: "faq",
	polls: "poll",
	socials: "social",
	mails: "mail",
	events: "event",
};

function normalizeRelationshipType(
	type: unknown,
): RelationshipEntityType | null {
	if (typeof type !== "string") return null;
	if ((VALID_RELATIONSHIP_TYPES as string[]).includes(type)) {
		return type as RelationshipEntityType;
	}
	return LEGACY_TYPE_ALIASES[type] || null;
}

/**
 * Load relationships for an entity across multiple relationship types.
 *
 * For each relationBType requested, this function:
 * 1. Queries entity_relationships to find linked entities
 * 2. Fetches full entity data for linked items
 * 3. Fetches available entities that could be linked
 * 4. Returns grouped data ready for RelationshipPicker
 *
 * @param db - Database adapter
 * @param entityType - Type of the source entity
 * @param entityId - ID of the source entity
 * @param relationBTypes - Array of entity types to load relationships for
 * @returns Record mapping each relationBType to { linked, available }
 */
export async function loadRelationshipsForEntity(
	db: ReturnType<typeof getDatabase>,
	entityType: RelationshipEntityType,
	entityId: string,
	relationBTypes: RelationshipEntityType[],
	options?: { userPermissions?: string[], includeAvailable?: boolean, preloadedRelationships?: any[] },
): Promise<Record<string, RelationshipData>> {
	const result: Record<string, RelationshipData> = {};
	const userPermissions = options?.userPermissions;
	const includeAvailable = options?.includeAvailable ?? true;
	const readableRelationTypes = relationBTypes.filter((relationBType) =>
		canReadRelationType(userPermissions, relationBType),
	);

	const allRelationships = options?.preloadedRelationships ?? await db.getEntityRelationships(
		entityType,
		entityId,
	);

	for (const relationBType of readableRelationTypes) {
		const linkedIds = allRelationships
			.map((rel) => {
				const normalizedAType = normalizeRelationshipType(rel.relationAType);
				const normalizedBType = normalizeRelationshipType(rel.relationBType);

				// Case 1: Current entity is relationA, linked entity is relationB
				if (normalizedAType === entityType && rel.relationId === entityId) {
					return normalizedBType === relationBType ? rel.relationBId : null;
				}
				// Case 2: Current entity is relationB, linked entity is relationA
				if (normalizedBType === entityType && rel.relationBId === entityId) {
					return normalizedAType === relationBType ? rel.relationId : null;
				}
				return null;
			})
			.filter((id): id is string => id !== null);

		const linked = await fetchEntitiesByType(db, relationBType, linkedIds);

		const canWrite = canWriteRelationType(userPermissions, relationBType);
		const available = canWrite && includeAvailable
			? await fetchAvailableEntities(db, relationBType, linkedIds)
			: [];

		result[relationBType] = { linked, available, canWrite };
	}

	return result;
}

/**
 * Fetch entities by type and IDs
 */
async function fetchEntitiesByType(
	db: ReturnType<typeof getDatabase>,
	entityType: RelationshipEntityType,
	ids: string[],
): Promise<unknown[]> {
	if (ids.length === 0) {
		return [];
	}

	const entities: unknown[] = [];

	for (const id of ids) {
		try {
			const entity = await fetchEntityById(db, entityType, id);
			if (entity) {
				entities.push(entity);
			}
		} catch (error) {
			console.error(
				`[LoadRelationships] Failed to fetch ${entityType} ${id}:`,
				error,
			);
		}
	}

	return entities;
}

/**
 * Fetch a single entity by type and ID
 */
async function fetchEntityById(
	db: ReturnType<typeof getDatabase>,
	entityType: RelationshipEntityType,
	id: string,
): Promise<unknown | null> {
	switch (entityType) {
		case "receipt":
			return db.getReceiptById(id);
		case "transaction":
			return db.getTransactionById(id);
		case "reimbursement":
			return db.getPurchaseById(id);
		case "budget":
			return db.getFundBudgetById(id);
		case "inventory":
			return db.getInventoryItemById(id);
		case "minute":
			return db.getMinuteById(id);
		case "news":
			return db.getNewsById(id);
		case "faq":
			return db.getFaqById(id);
		case "poll":
			return db.getPollById(id);
		case "social":
			return db.getSocialLinkById(id);
		case "mail":
			return (
				(await db.getCommitteeMailMessageById(id)) ||
				(await db.getMailDraftById(id))
			);
		case "event":
			return db.getEventById(id);
		default:
			return null;
	}
}

/**
 * Fetch available entities (non-archived, excluding already linked)
 */
async function fetchAvailableEntities(
	db: ReturnType<typeof getDatabase>,
	entityType: RelationshipEntityType,
	excludeIds: string[],
): Promise<unknown[]> {
	let allEntities: unknown[] = [];

	switch (entityType) {
		case "receipt":
			allEntities = await db.getReceipts();
			break;
		case "transaction":
			allEntities = await db.getAllTransactions();
			break;
		case "reimbursement":
			allEntities = await db.getPurchases();
			break;
		case "budget":
			allEntities = await db.getFundBudgets();
			break;
		case "inventory":
			allEntities = await db.getInventoryItems();
			break;
		case "minute":
			allEntities = await db.getMinutes();
			break;
		case "news":
			allEntities = await db.getNews();
			break;
		case "faq":
			allEntities = await db.getFaqs();
			break;
		case "poll":
			allEntities = await db.getPolls();
			break;
		case "social":
			allEntities = await db.getSocialLinks();
			break;
		case "mail":
			allEntities = [
				...(await db.getMailDrafts(50)),
				...(await db.getCommitteeMailMessages("inbox", 50)),
				...(await db.getCommitteeMailMessages("sent", 50)),
			];
			break;
		case "event":
			allEntities = await db.getEvents();
			break;
	}

	// Dedupe by id, then filter out archived entities and already linked ones
	const deduped = Array.from(
		new Map(allEntities.map((entity: any) => [entity.id, entity])).values(),
	);
	return deduped.filter((entity: any) => {
		// Exclude already linked
		if (excludeIds.includes(entity.id)) {
			return false;
		}
		// Exclude archived (if status field exists and is "archived")
		if (entity.status === "archived") {
			return false;
		}
		return true;
	});
}

/**
 * Load relationships for a specific relationBType only.
 * Convenience function when only one type is needed.
 */
export async function loadRelationshipsForType(
	db: ReturnType<typeof getDatabase>,
	entityType: RelationshipEntityType,
	entityId: string,
	relationBType: RelationshipEntityType,
	options?: { userPermissions?: string[] },
): Promise<RelationshipData> {
	const result = await loadRelationshipsForEntity(db, entityType, entityId, [
		relationBType,
	], options);
	return result[relationBType] || { linked: [], available: [], canWrite: false };
}
