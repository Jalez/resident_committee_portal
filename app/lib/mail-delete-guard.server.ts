import type { DatabaseAdapter } from "~/db/adapters/types";
import type { EntityRelationship } from "~/db/schema";
import type { RelationshipEntityType } from "~/db/types";

/**
 * Given a mail_thread's relations, determine the "other side" entity
 * for each relation and check whether it still exists in the database.
 *
 * Returns only relations whose target entity still exists.
 * Orphaned relation rows (pointing to deleted entities) are cleaned up automatically.
 */
export async function getLiveRelations(
	db: DatabaseAdapter,
	threadId: string,
): Promise<EntityRelationship[]> {
	const relations = await db.getEntityRelationships("mail_thread", threadId);
	if (relations.length === 0) return [];

	const live: EntityRelationship[] = [];

	for (const rel of relations) {
		const other = getOtherSide(rel, threadId);
		if (!other) {
			// Relation doesn't reference this thread at all (shouldn't happen)
			live.push(rel);
			continue;
		}

		const exists = await entityExists(db, other.type, other.id);
		if (exists) {
			live.push(rel);
		} else {
			// Clean up the orphaned relation row
			await db.deleteEntityRelationship(rel.id);
		}
	}

	return live;
}

function getOtherSide(
	rel: EntityRelationship,
	threadId: string,
): { type: RelationshipEntityType; id: string } | null {
	if (rel.relationAType === "mail_thread" && rel.relationId === threadId) {
		return { type: rel.relationBType, id: rel.relationBId };
	}
	if (rel.relationBType === "mail_thread" && rel.relationBId === threadId) {
		return { type: rel.relationAType, id: rel.relationId };
	}
	return null;
}

async function entityExists(
	db: DatabaseAdapter,
	type: RelationshipEntityType,
	id: string,
): Promise<boolean> {
	try {
		switch (type) {
			case "receipt":
				return !!(await db.getReceiptById(id));
			case "transaction":
				return !!(await db.getTransactionById(id));
			case "reimbursement":
				return !!(await db.getPurchaseById(id));
			case "budget":
				return !!(await db.getFundBudgetById(id));
			case "inventory":
				return !!(await db.getInventoryItemById(id));
			case "minute":
				return !!(await db.getMinuteById(id));
			case "news":
				return !!(await db.getNewsById(id));
			case "faq":
				return !!(await db.getFaqById(id));
			case "poll":
				return !!(await db.getPollById(id));
			case "social":
				return !!(await db.getSocialLinkById(id));
			case "event":
				return !!(await db.getEventById(id));
			case "mail_thread":
				return !!(await db.getCommitteeMailThreadById(id));
			case "submission":
				return !!(await db.getSubmissionById(id));
			case "message":
				return !!(await db.getMessageById(id));
			default:
				// Unknown type — assume it exists to be safe
				return true;
		}
	} catch {
		// If lookup fails, assume the entity is gone
		return false;
	}
}
