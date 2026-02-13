/**
 * API Route: POST /api/drafts/cleanup
 *
 * Admin endpoint to clean up orphaned draft entities.
 * Finds all draft entities with no relationships and deletes them.
 *
 * Request Body: { olderThanMinutes?: number, dryRun?: boolean }
 * Response: { success, deletedCount, deleted: [{ type, id }], errors? }
 */

import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server";
import type { RelationshipEntityType } from "~/db";
import { getAuthenticatedUser } from "~/lib/auth.server";

interface CleanupRequest {
	olderThanMinutes?: number;
	dryRun?: boolean;
}

interface DraftEntity {
	type: RelationshipEntityType;
	id: string;
	name?: string;
}

export async function action({ request }: ActionFunctionArgs) {
	// 1. Auth check - require admin permission
	const db = getDatabase();
	const user = await getAuthenticatedUser(request, () => db);
	if (!user) {
		return Response.json(
			{ success: false, error: "Unauthorized" },
			{ status: 401 },
		);
	}

	if (!user.permissions.includes("admin") && !user.permissions.includes("*")) {
		return Response.json(
			{ success: false, error: "Admin permission required" },
			{ status: 403 },
		);
	}

	// 2. Parse request
	let body: CleanupRequest = {};
	try {
		if (request.headers.get("content-type")?.includes("application/json")) {
			body = await request.json();
		}
	} catch {
		// Empty body is fine - use defaults
	}

	const olderThanMinutes = body.olderThanMinutes ?? 60; // Default 1 hour grace period
	const dryRun = body.dryRun ?? false;

	// 3. Get database adapter
	const result = {
		success: true,
		deletedCount: 0,
		deleted: [] as Array<{
			type: RelationshipEntityType;
			id: string;
			name?: string;
		}>,
		errors: [] as string[],
	};

	// 4. Entity types that support draft status
	const draftableTypes: RelationshipEntityType[] = [
		"receipt",
		"transaction",
		"reimbursement",
		"budget",
		"inventory",
		"minute",
	];

	try {
		// 5. Find orphaned drafts for each type
		for (const entityType of draftableTypes) {
			try {
				// Get orphaned draft IDs
				const orphanedIds = await db.getOrphanedDrafts(
					entityType,
					olderThanMinutes,
				);

				if (orphanedIds.length === 0) {
					continue;
				}

				console.log(
					`[DraftCleanup] Found ${orphanedIds.length} orphaned ${entityType} drafts`,
				);

				if (dryRun) {
					// In dry run mode, just report what would be deleted
					for (const id of orphanedIds) {
						result.deleted.push({ type: entityType, id });
					}
					continue;
				}

				// Delete associated files first (for receipts and minutes)
				for (const id of orphanedIds) {
					try {
						await deleteAssociatedFiles(db, entityType, id);
					} catch (error) {
						console.error(
							`[DraftCleanup] Failed to delete files for ${entityType} ${id}:`,
							error,
						);
						// Continue with entity deletion even if file deletion fails
					}
				}

				// Delete the orphaned entities
				const deletedCount = await db.bulkDeleteDraftEntities(
					entityType,
					orphanedIds,
				);

				result.deletedCount += deletedCount;

				for (const id of orphanedIds.slice(0, deletedCount)) {
					result.deleted.push({ type: entityType, id });
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				result.errors.push(`Failed to cleanup ${entityType}: ${errorMsg}`);
				console.error(`[DraftCleanup] Error processing ${entityType}:`, error);
			}
		}

		if (dryRun) {
			result.deletedCount = result.deleted.length;
		}

		return Response.json(result);
	} catch (error) {
		console.error("[DraftCleanup] Cleanup failed:", error);
		return Response.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Cleanup failed",
				deletedCount: result.deletedCount,
				deleted: result.deleted,
				errors: result.errors,
			},
			{ status: 500 },
		);
	}
}

/**
 * Delete files associated with an entity
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
				// Dynamically import to avoid circular dependencies
				const { getReceiptStorage } = await import("~/lib/receipts/server");
				const storage = getReceiptStorage();
				await storage.deleteFile(receipt.pathname);
				console.log(`[DraftCleanup] Deleted receipt file: ${receipt.pathname}`);
			} catch (error) {
				console.error(`[DraftCleanup] Failed to delete receipt file:`, error);
			}
		}
	} else if (entityType === "minute") {
		const minute = await db.getMinuteById(entityId);
		if (minute?.fileKey) {
			try {
				const { getMinuteStorage } = await import(
					"~/lib/minutes/storage.server"
				);
				const storage = getMinuteStorage();
				await storage.deleteFile(minute.fileKey);
				console.log(`[DraftCleanup] Deleted minute file: ${minute.fileKey}`);
			} catch (error) {
				console.error(`[DraftCleanup] Failed to delete minute file:`, error);
			}
		}
	}
}
