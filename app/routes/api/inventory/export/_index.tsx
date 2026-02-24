import { getDatabase, type InventoryItem } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { buildCsvResponse, escapeCSV } from "~/lib/csv-utils";
import type { Route } from "./+types/_index";

/**
 * Export all inventory items as CSV (requires inventory:export permission)
 */
export async function loader({ request }: Route.LoaderArgs) {
	// Requires inventory:export permission
	await requirePermission(request, "inventory:export", getDatabase);

	const db = getDatabase();
	const items = await db.getInventoryItems();

	// CSV header
	const headers = [
		"id",
		"name",
		"quantity",
		"location",
		"category",
		"description",
		"purchasedAt",
		"createdAt",
		"updatedAt",
	];

	// Convert items to CSV rows
	const rows = items.map((item: InventoryItem) => {
		return [
			item.id,
			escapeCSV(item.name),
			item.quantity.toString(),
			escapeCSV(item.location ?? "missing location"),
			escapeCSV(item.category || ""),
			escapeCSV(item.description || ""),
			item.purchasedAt
				? new Date(item.purchasedAt).toISOString().split("T")[0]
				: "",
			item.createdAt ? new Date(item.createdAt).toISOString() : "",
			item.updatedAt ? new Date(item.updatedAt).toISOString() : "",
		].join(",");
	});

	const date = new Date().toISOString().split("T")[0];
	const filename = `inventory-${date}.csv`;

	return buildCsvResponse([headers.join(","), ...rows], filename);
}
