/**
 * Draft Lifecycle Management Utilities
 * 
 * Handles automatic cleanup of orphaned draft entities when relationships
 * are removed. Ensures that draft entities without any relationships are
 * automatically deleted along with their associated files.
 */

import type { RelationshipEntityType } from "~/db/schema";
import type { getDatabase } from "~/db";
import { getReceiptStorage } from "~/lib/receipts";
import { getMinuteStorage } from "~/lib/minutes/storage.server";

/**
 * Check if an entity is a draft that has become orphaned after unlinking.
 * If orphaned, delete the entity and its associated files.
 */
export async function cleanupOrphanedDraft(
	db: ReturnType<typeof getDatabase>,
	entityType: RelationshipEntityType,
	entityId: string,
): Promise<boolean> {
	try {
		// 1. Check if the entity is a draft
		const isDraft = await isEntityDraft(db, entityType, entityId);
		if (!isDraft) {
			return false; // Not a draft, no cleanup needed
		}

		// 2. Check if the entity has any remaining relationships
		const relationships = await db.getEntityRelationships(entityType, entityId);
		if (relationships.length > 0) {
			return false; // Still has relationships, don't delete
		}

		console.log(`[DraftLifecycle] Deleting orphaned ${entityType} draft: ${entityId}`);

		// 3. Delete associated files first
		await deleteAssociatedFiles(db, entityType, entityId);

		// 4. Delete the entity
		const deleted = await deleteEntity(db, entityType, entityId);

		if (deleted) {
			console.log(`[DraftLifecycle] Successfully deleted orphaned ${entityType}: ${entityId}`);
		}

		return deleted;
	} catch (error) {
		console.error(`[DraftLifecycle] Failed to cleanup orphaned ${entityType} ${entityId}:`, error);
		return false;
	}
}

/**
 * Check if an entity has draft status
 */
async function isEntityDraft(
	db: ReturnType<typeof getDatabase>,
	entityType: RelationshipEntityType,
	entityId: string,
): Promise<boolean> {
	switch (entityType) {
		case "receipt": {
			const entity = await db.getReceiptById(entityId);
			return entity?.status === "draft";
		}
		case "transaction": {
			const entity = await db.getTransactionById(entityId);
			return entity?.status === "draft";
		}
		case "reimbursement": {
			const entity = await db.getPurchaseById(entityId);
			return entity?.status === "draft";
		}
		case "budget": {
			const entity = await db.getFundBudgetById(entityId);
			return entity?.status === "draft";
		}
		case "inventory": {
			const entity = await db.getInventoryItemById(entityId);
			return entity?.status === "draft";
		}
		case "minute": {
			const entity = await db.getMinuteById(entityId);
			return entity?.status === "draft";
		}
		default:
			// News/FAQ don't have draft status in current schema
			return false;
	}
}

/**
 * Delete files associated with an entity before deleting the entity
 */
async function deleteAssociatedFiles(
	db: ReturnType<typeof getDatabase>,
	entityType: RelationshipEntityType,
	entityId: string,
): Promise<void> {
	if (entityType === "receipt") {
		const receipt = await db.getReceiptById(entityId);
		if (receipt?.pathname) {
			try {
				const storage = getReceiptStorage();
				await storage.deleteFile(receipt.pathname);
				console.log(`[DraftLifecycle] Deleted receipt file: ${receipt.pathname}`);
			} catch (error) {
				console.error(`[DraftLifecycle] Failed to delete receipt file:`, error);
			}
		}
	} else if (entityType === "minute") {
		const minute = await db.getMinuteById(entityId);
		if (minute?.fileKey) {
			try {
				const storage = getMinuteStorage();
				await storage.deleteFile(minute.fileKey);
				console.log(`[DraftLifecycle] Deleted minute file: ${minute.fileKey}`);
			} catch (error) {
				console.error(`[DraftLifecycle] Failed to delete minute file:`, error);
			}
		}
	}
	// Other entity types don't have associated files
}

/**
 * Delete an entity by type and ID
 */
async function deleteEntity(
	db: ReturnType<typeof getDatabase>,
	entityType: RelationshipEntityType,
	entityId: string,
): Promise<boolean> {
	try {
		switch (entityType) {
			case "receipt":
				return await db.deleteReceipt(entityId);
			case "transaction":
				return await db.deleteTransaction(entityId);
			case "reimbursement":
				return await db.deletePurchase(entityId);
			case "budget":
				return await db.deleteFundBudget(entityId);
			case "inventory":
				return await db.deleteInventoryItem(entityId);
			case "minute":
				return await db.deleteMinute(entityId);
			case "news":
				return await db.deleteNews(entityId);
			case "faq":
				return await db.deleteFaq(entityId);
			default:
				console.error(`[DraftLifecycle] Unknown entity type: ${entityType}`);
				return false;
		}
	} catch (error) {
		console.error(`[DraftLifecycle] Failed to delete ${entityType}:`, error);
		return false;
	}
}

/**
 * Batch cleanup for multiple entities after bulk unlink operations
 */
export async function cleanupOrphanedDrafts(
	db: ReturnType<typeof getDatabase>,
	entities: Array<{ type: RelationshipEntityType; id: string }>,
): Promise<number> {
	let cleanedCount = 0;

	for (const entity of entities) {
		const cleaned = await cleanupOrphanedDraft(db, entity.type, entity.id);
		if (cleaned) {
			cleanedCount++;
		}
	}

	return cleanedCount;
}
