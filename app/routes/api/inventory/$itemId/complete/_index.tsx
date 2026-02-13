import { type ActionFunctionArgs, redirect } from "react-router";
import { getDatabase } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";

/**
 * API route to quickly complete an inventory item by setting its location
 */
export async function action({ request, params }: ActionFunctionArgs) {
	const { itemId } = params;

	if (!itemId) {
		throw new Response("Item ID is required", { status: 400 });
	}

	// Check permissions
	await requirePermission(request, "inventory:write", getDatabase);

	const formData = await request.formData();
	const location = formData.get("location") as string;

	if (!location || location.trim() === "") {
		throw new Response("Location is required", { status: 400 });
	}

	const db = getDatabase();

	// Get the item to verify it exists
	const item = await db.getInventoryItemById(itemId);
	if (!item) {
		throw new Response("Item not found", { status: 404 });
	}

	// Update the item with location and mark as complete
	await db.updateInventoryItem(itemId, {
		location: location.trim(),
		needsCompletion: false,
		completionNotes: null,
	});

	// Redirect back to incomplete items page
	return redirect("/inventory/incomplete");
}
