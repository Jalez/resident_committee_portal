import { data } from "react-router";
import { getDatabase } from "~/db/server.server";
import type { RelationshipEntityType } from "~/db/types";
import { requireAnyPermission } from "~/lib/auth.server";

export async function action({
	request,
	params,
}: {
	request: Request;
	params: { type: string; id: string };
}) {
	const entityType = params.type as RelationshipEntityType;
	const entityId = params.id;

	if (!entityType || !entityId) {
		return data({ error: "Missing entity type or ID" }, { status: 400 });
	}

	// Permission check based on entity type
	const permissionMap: Record<string, string[]> = {
		receipt: ["treasury:receipts:write"],
		transaction: ["treasury:transactions:write"],
		reimbursement: ["treasury:reimbursements:write"],
		budget: ["treasury:budgets:write"],
		inventory: ["inventory:write"],
		minute: ["minutes:write"],
		news: ["news:write"],
		faq: ["faq:write"],
		poll: ["polls:write"],
		social: ["social:write"],
		event: ["events:write"],
		mail: ["mail:write"],
	};

	const permissions = permissionMap[entityType] || ["admin"];
	await requireAnyPermission(request, permissions, getDatabase);

	const db = getDatabase();

	try {
		// First, delete all relationships for this entity
		const relationships = await db.getEntityRelationships(entityType, entityId);

		for (const rel of relationships) {
			await db.deleteEntityRelationship(rel.id);
		}

		// Then delete the entity itself based on type
		switch (entityType) {
			case "receipt":
				await db.deleteReceipt(entityId);
				break;
			case "transaction":
				await db.deleteTransaction(entityId);
				break;
			case "reimbursement":
				await db.deletePurchase(entityId);
				break;
			case "budget":
				await db.deleteFundBudget(entityId);
				break;
			case "inventory":
				await db.deleteInventoryItem(entityId);
				break;
			case "minute":
				await db.deleteMinute(entityId);
				break;
			case "news":
				await db.deleteNews(entityId);
				break;
			case "faq":
				await db.deleteFaq(entityId);
				break;
			case "poll":
				await db.deletePoll(entityId);
				break;
			case "social":
				await db.deleteSocialLink(entityId);
				break;
			case "mail":
				// Mail might not have a delete method, skip for now
				break;
			case "event":
				// Events are managed via Google Calendar, would need special handling
				break;
			default:
				return data(
					{ error: `Unknown entity type: ${entityType}` },
					{ status: 400 },
				);
		}

		return data({ success: true });
	} catch (error) {
		console.error(
			`[DeleteEntity] Failed to delete ${entityType}:${entityId}:`,
			error,
		);
		return data({ error: "Failed to delete entity" }, { status: 500 });
	}
}
