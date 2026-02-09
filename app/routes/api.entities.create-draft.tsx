import type { Route } from "./+types/api.entities.create-draft";
import { data } from "react-router";
import { getDatabase } from "~/db";
import type { RelationshipEntityType } from "~/db/schema";
import { requireAnyPermission } from "~/lib/auth.server";

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const type = formData.get("type") as RelationshipEntityType;
	const sourceType = formData.get("sourceType") as RelationshipEntityType | null;
	const sourceId = formData.get("sourceId") as string | null;
	const sourceName = formData.get("sourceName") as string | null;

	if (!type) {
		return data({ success: false, error: "Missing entity type" }, { status: 400 });
	}

	const db = getDatabase();

	// Check permissions - require appropriate write permission
	const permissionMap: Record<RelationshipEntityType, string[]> = {
		receipt: ["treasury:receipts:write"],
		transaction: ["treasury:transactions:write"],
		reimbursement: ["treasury:reimbursements:write"],
		budget: ["treasury:budgets:write"],
		inventory: ["inventory:write"],
		minute: ["minutes:write"],
		news: ["news:write"],
		faq: ["faq:write"],
	};

	const permissions = permissionMap[type] || ["admin"];
	const user = await requireAnyPermission(request, permissions, getDatabase);

	const userId = user.userId || null;

	try {
		let entity: { id: string; name?: string | null; description?: string | null; status?: string } | null = null;

		switch (type) {
			case "transaction": {
				entity = await db.createTransaction({
					amount: "0",
					date: new Date(),
					description: "",
					type: "expense",
					year: new Date().getFullYear(),
					status: "draft",
					createdBy: userId,
				});
				break;
			}

			case "receipt": {
				entity = await db.createReceipt({
					status: "draft",
					createdBy: userId,
				});
				break;
			}

			case "reimbursement": {
				entity = await db.createPurchase({
					amount: "0",
					year: new Date().getFullYear(),
					purchaserName: "",
					bankAccount: "",
					minutesId: "",
					status: "draft",
					createdBy: userId,
				});
				break;
			}

			case "budget": {
				entity = await db.createFundBudget({
					amount: "0",
					name: "",
					year: new Date().getFullYear(),
					status: "draft",
					createdBy: userId,
				});
				break;
			}

			case "inventory": {
				entity = await db.createInventoryItem({
					name: "",
					status: "draft",
				});
				break;
			}

			case "minute": {
				entity = await db.createMinute({
					status: "draft",
					createdBy: userId,
				});
				break;
			}

			case "news": {
				entity = await db.createNews({
					title: "",
					content: "",
					createdBy: userId,
				});
				break;
			}

			case "faq": {
				entity = await db.createFaq({
					question: "",
					answer: "",
				});
				break;
			}

			default:
				return data({ success: false, error: `Unknown entity type: ${type}` }, { status: 400 });
		}

		// Create relationship immediately if source context is provided
		// This links the new draft to the source entity right away
		if (sourceType && sourceId && entity) {
			await db.createEntityRelationship({
				relationAType: sourceType,
				relationId: sourceId,
				relationBType: type,
				relationBId: entity.id,
				createdBy: userId,
			});
		}

		return data({ 
			success: true, 
			entity: {
				id: entity.id,
				type,
				name: entity.name || entity.description || `${type} (draft)`,
				status: entity.status || "draft",
			},
			linked: !!(sourceType && sourceId),
		});
	} catch (error) {
		console.error(`[CreateDraft] Failed to create ${type} draft:`, error);
		return data({ success: false, error: "Failed to create draft entity" }, { status: 500 });
	}
}
