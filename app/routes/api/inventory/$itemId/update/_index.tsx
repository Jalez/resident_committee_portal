import { type ActionFunctionArgs, redirect } from "react-router";
import { getDatabase, type NewInventoryItem } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { getDraftAutoPublishStatus } from "~/lib/draft-auto-publish";

export async function action({ request, params }: ActionFunctionArgs) {
	const { itemId } = params;
	if (!itemId) throw new Response("Item ID required", { status: 400 });

	const user = await requirePermission(request, "inventory:write", getDatabase);
	const db = getDatabase();

	const currentItem = await db.getInventoryItemById(itemId);
	if (!currentItem) {
		throw new Response("Not Found", { status: 404 });
	}

	const formData = await request.formData();

	const updateData: Partial<Omit<NewInventoryItem, "id">> = {
		name: formData.get("name") as string,
		quantity: parseInt(formData.get("quantity") as string, 10) || 1,
		location: formData.get("location") as string,
		category: (formData.get("category") as string) || null,
		description: (formData.get("description") as string) || null,
		value: (formData.get("value") as string) || "0",
		showInInfoReel: formData.get("showInInfoReel") === "on",
		purchasedAt: formData.get("purchasedAt")
			? new Date(formData.get("purchasedAt") as string)
			: null,
	};

	// Auto-publish draft
	if (currentItem.status === "draft") {
		const newStatus = getDraftAutoPublishStatus("inventory", "draft", {
			name: updateData.name,
			location: updateData.location,
		});
		if (newStatus) {
			updateData.status = newStatus as any;
		}
	}

	await db.updateInventoryItem(itemId, updateData);

	// Context auto-linking
	const sourceType = formData.get("_sourceType") as string | null;
	const sourceId = formData.get("_sourceId") as string | null;
	if (sourceType && sourceId) {
		const exists = await db.entityRelationshipExists(
			sourceType as any,
			sourceId,
			"inventory",
			itemId,
		);
		if (!exists) {
			await db.createEntityRelationship({
				relationAType: sourceType as any,
				relationId: sourceId,
				relationBType: "inventory",
				relationBId: itemId,
				createdBy: user?.userId || null,
			});
		}
	}

	// Handle returnUrl
	const returnUrl = formData.get("_returnUrl") as string | null;
	if (returnUrl) {
		return redirect(returnUrl);
	}

	return redirect(`/inventory/${itemId}`);
}
