/**
 * Server-side utilities for loading relationship data for entities.
 * 
 * Queries the universal entity_relationships table and fetches related entities,
 * providing data ready for the RelationshipPicker component.
 */

import type { RelationshipEntityType } from "~/db/schema";
import type { getDatabase } from "~/db";

interface RelationshipData<T = unknown> {
	linked: T[];
	available: T[];
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
): Promise<Record<string, RelationshipData>> {
	const result: Record<string, RelationshipData> = {};

	// Load relationships for each type
	for (const relationBType of relationBTypes) {
		const relationships = await db.getEntityRelationships(
			entityType,
			entityId,
		);

		// Extract linked entity IDs
		const linkedIds = relationships.map((rel) => {
			// Entity can be either relationA or relationB
			if (rel.relationAType === entityType && rel.relationId === entityId) {
				return rel.relationBId;
			}
			return rel.relationId;
		});

		// Fetch linked entities with full data
		const linked = await fetchEntitiesByType(db, relationBType, linkedIds);

		// Fetch available entities (all non-archived entities of this type)
		const available = await fetchAvailableEntities(db, relationBType, linkedIds);

		result[relationBType] = { linked, available };
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
			console.error(`[LoadRelationships] Failed to fetch ${entityType} ${id}:`, error);
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
	}

	// Filter out archived entities and already linked ones
	return allEntities.filter((entity: any) => {
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
): Promise<RelationshipData> {
	const result = await loadRelationshipsForEntity(db, entityType, entityId, [
		relationBType,
	]);
	return result[relationBType] || { linked: [], available: [] };
}
