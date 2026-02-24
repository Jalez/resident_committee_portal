import { getDatabase, type NewInventoryItem } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import {
	getColumnFromRow,
	parseFileToRows,
} from "~/lib/import-parse.server";
import type { Route } from "./+types/_index";

/**
 * Import inventory items from CSV or Excel (requires inventory:import permission)
 * Expects multipart form data with a "file" field containing CSV or XLSX
 */
export async function action({ request }: Route.ActionArgs) {
	// Requires inventory:import permission
	await requirePermission(request, "inventory:import", getDatabase);

	const db = getDatabase();

	try {
		const formData = await request.formData();
		const file = formData.get("file") as File;

		const result = await parseFileToRows(file);
		if (!result.ok) return result.error;
		const rows = result.rows;

		// Parse rows into inventory items
		const items: NewInventoryItem[] = [];
		const errors: string[] = [];

		for (let i = 0; i < rows.length; i++) {
			try {
				const row = rows[i];

				// Get values (support multiple column name formats)
				const name = getColumnFromRow(row, [
					"Item Name",
					"name",
					"Name",
				]) as string;
				const location = getColumnFromRow(row, [
					"Location",
					"location",
				]) as string;

				if (!name || !location) {
					errors.push(`Row ${i + 2}: Missing name or location`);
					continue;
				}

				const quantityRaw = getColumnFromRow(row, [
					"Quantity",
					"quantity",
				]);
				const categoryRaw = getColumnFromRow(row, [
					"Category",
					"category",
				]);
				const descriptionRaw = getColumnFromRow(row, [
					"Description",
					"description",
				]);
				const purchasedRaw = getColumnFromRow(row, [
					"Purchased",
					"purchasedAt",
					"purchased_at",
				]);

				const item: NewInventoryItem = {
					name: String(name).trim(),
					location: String(location).trim(),
					quantity: quantityRaw ? parseInt(String(quantityRaw), 10) || 1 : 1,
					category: categoryRaw ? String(categoryRaw).trim() || null : null,
					description: descriptionRaw
						? String(descriptionRaw).trim() || null
						: null,
					purchasedAt: purchasedRaw ? parseDate(purchasedRaw) : null,
				};

				items.push(item);
			} catch (_err) {
				errors.push(`Row ${i + 2}: Parse error`);
			}
		}

		if (items.length === 0) {
			return Response.json(
				{ success: false, error: "No valid items found", details: errors },
				{ status: 400 },
			);
		}

		// Bulk create items
		const created = await db.bulkCreateInventoryItems(items);

		return Response.json({
			success: true,
			imported: created.length,
			errors: errors.length > 0 ? errors : undefined,
		});
	} catch (error) {
		console.error("[Import] Error:", error);
		return Response.json(
			{ success: false, error: "Failed to process file" },
			{ status: 500 },
		);
	}
}

/**
 * Parse a date from various formats (Excel serial, string, etc.)
 */
function parseDate(value: unknown): Date | null {
	if (!value) return null;

	// Excel serial date number
	if (typeof value === "number") {
		// Excel dates are days since 1900-01-01 (with a bug for 1900 leap year)
		const excelEpoch = new Date(1899, 11, 30);
		return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
	}

	// String date
	if (typeof value === "string") {
		const date = new Date(value.trim());
		return Number.isNaN(date.getTime()) ? null : date;
	}

	return null;
}
