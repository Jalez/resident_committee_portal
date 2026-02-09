/**
 * Server-side utilities for saving relationship changes from forms.
 * 
 * Handles:
 * - Creating new relationships
 * - Deleting relationships
 * - Automatic cleanup of orphaned drafts
 * - Write-through to legacy FKs (for backward compatibility)
 */

import type { RelationshipEntityType } from "~/db/schema";
import type { getDatabase } from "~/db";
import { cleanupOrphanedDraft } from "./draft-lifecycle.server";

interface RelationshipLink {
	relationBType: RelationshipEntityType;
	relationBId: string;
	metadata?: Record<string, unknown>;
}

interface RelationshipUnlink {
	relationBType: RelationshipEntityType;
	relationBId: string;
}

interface SaveRelationshipChangesResult {
	linked: number;
	unlinked: number;
	orphansDeleted: number;
}

/**
 * Save relationship changes from form data.
 * 
 * Reads _relationship_links and _relationship_unlinks from form data,
 * applies changes to the database, and cleans up orphaned drafts.
 * 
 * @param db - Database adapter
 * @param relationAType - Type of the source entity
 * @param relationId - ID of the source entity
 * @param formData - Form data containing relationship changes
 * @param userId - ID of the user making the changes
 * @returns Stats about the operation
 */
export async function saveRelationshipChanges(
	db: ReturnType<typeof getDatabase>,
	relationAType: RelationshipEntityType,
	relationId: string,
	formData: FormData,
	userId: string | null,
): Promise<SaveRelationshipChangesResult> {
	const result: SaveRelationshipChangesResult = {
		linked: 0,
		unlinked: 0,
		orphansDeleted: 0,
	};

	// Parse relationship changes from form data
	const linksParam = formData.get("_relationship_links");
	const unlinksParam = formData.get("_relationship_unlinks");

	const links: RelationshipLink[] = linksParam
		? JSON.parse(linksParam as string)
		: [];
	const unlinks: RelationshipUnlink[] = unlinksParam
		? JSON.parse(unlinksParam as string)
		: [];

	// 1. Process unlinks first (with orphan cleanup)
	const orphanCandidates: Array<{ type: RelationshipEntityType; id: string }> = [];

	for (const unlink of unlinks) {
		try {
			const deleted = await db.deleteEntityRelationshipByPair(
				relationAType,
				relationId,
				unlink.relationBType,
				unlink.relationBId,
			);

			if (deleted) {
				result.unlinked++;
				// Add to orphan candidates for cleanup
				orphanCandidates.push({
					type: unlink.relationBType,
					id: unlink.relationBId,
				});

				console.log(
					`[SaveRelationships] Unlinked ${relationAType}:${relationId} <-> ${unlink.relationBType}:${unlink.relationBId}`,
				);
			}
		} catch (error) {
			console.error(
				`[SaveRelationships] Failed to unlink ${unlink.relationBType}:${unlink.relationBId}:`,
				error,
			);
		}
	}

	// 2. Cleanup orphaned drafts
	for (const candidate of orphanCandidates) {
		const deleted = await cleanupOrphanedDraft(db, candidate.type, candidate.id);
		if (deleted) {
			result.orphansDeleted++;
		}
	}

	// 3. Process links
	for (const link of links) {
		try {
			// Check if relationship already exists
			const exists = await db.entityRelationshipExists(
				relationAType,
				relationId,
				link.relationBType,
				link.relationBId,
			);

			if (!exists) {
				await db.createEntityRelationship({
					relationAType,
					relationId,
					relationBType: link.relationBType,
					relationBId: link.relationBId,
					metadata: link.metadata ? JSON.stringify(link.metadata) : null,
					createdBy: userId,
				});

				result.linked++;

				console.log(
					`[SaveRelationships] Linked ${relationAType}:${relationId} <-> ${link.relationBType}:${link.relationBId}`,
				);
			}
		} catch (error) {
			console.error(
				`[SaveRelationships] Failed to link ${link.relationBType}:${link.relationBId}:`,
				error,
			);
		}
	}

	if (result.linked > 0 || result.unlinked > 0) {
		console.log(
			`[SaveRelationships] Completed: ${result.linked} linked, ${result.unlinked} unlinked, ${result.orphansDeleted} orphans deleted`,
		);
	}

	return result;
}

/**
 * Delete all relationships for an entity and cleanup orphaned drafts.
 * Useful when deleting an entity.
 */
export async function deleteAllRelationships(
	db: ReturnType<typeof getDatabase>,
	entityType: RelationshipEntityType,
	entityId: string,
): Promise<number> {
	// Get all relationships for this entity
	const relationships = await db.getEntityRelationships(entityType, entityId);

	let deletedCount = 0;
	const orphanCandidates: Array<{ type: RelationshipEntityType; id: string }> =
		[];

	// Delete each relationship
	for (const rel of relationships) {
		try {
			const deleted = await db.deleteEntityRelationship(rel.id);
			if (deleted) {
				deletedCount++;

				// Determine which entity might be orphaned
				if (rel.relationAType === entityType && rel.relationId === entityId) {
					// This entity was relationA, check relationB
					orphanCandidates.push({
						type: rel.relationBType,
						id: rel.relationBId,
					});
				} else {
					// This entity was relationB, check relationA
					orphanCandidates.push({
						type: rel.relationAType,
						id: rel.relationId,
					});
				}
			}
		} catch (error) {
			console.error(`[SaveRelationships] Failed to delete relationship:`, error);
		}
	}

	// Cleanup orphaned drafts
	for (const candidate of orphanCandidates) {
		await cleanupOrphanedDraft(db, candidate.type, candidate.id);
	}

	return deletedCount;
}
