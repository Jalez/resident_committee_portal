import { getDatabase, type InventoryItem } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import type { Route } from "./+types/api.inventory.export";

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
		"value",
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
			escapeCSV(item.location),
			escapeCSV(item.category || ""),
			escapeCSV(item.description || ""),
			item.value || "0",
			item.purchasedAt
				? new Date(item.purchasedAt).toISOString().split("T")[0]
				: "",
			item.createdAt ? new Date(item.createdAt).toISOString() : "",
			item.updatedAt ? new Date(item.updatedAt).toISOString() : "",
		].join(",");
	});

	const csv = `\uFEFF${[headers.join(","), ...rows].join("\n")}`;

	const date = new Date().toISOString().split("T")[0];
	const filename = `inventory-${date}.csv`;

	return new Response(csv, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
		},
	});
}

function escapeCSV(value: string): string {
	if (!value) return "";
	// If value contains comma, newline, or quote, wrap in quotes and escape quotes
	if (value.includes(",") || value.includes("\n") || value.includes('"')) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}
