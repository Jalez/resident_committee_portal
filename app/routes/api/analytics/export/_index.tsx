import { getDatabase } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { getSheetData } from "~/lib/google.server";
import type { Route } from "./+types/_index";

/**
 * Export analytics sheet data as CSV (requires forms:export permission)
 */
export async function loader({ request }: Route.LoaderArgs) {
	// Requires forms:export permission
	await requirePermission(request, "forms:export", getDatabase);

	const url = new URL(request.url);
	const sheetId = url.searchParams.get("sheetId");

	if (!sheetId) {
		return new Response("Missing sheetId parameter", { status: 400 });
	}

	const sheetData = await getSheetData(sheetId, false);

	if (!sheetData) {
		return new Response("Sheet not found or not accessible", { status: 404 });
	}

	// Extract filters from query params
	const filters: Record<string, string> = {};
	sheetData.headers.forEach((header, index) => {
		const filterValue = url.searchParams.get(`col_${index}`);
		if (filterValue) {
			filters[header] = filterValue;
		}
	});

	// Apply filters
	let filteredRows = sheetData.rows;
	for (const [header, value] of Object.entries(filters)) {
		if (value) {
			const searchValue = value.toLowerCase();
			filteredRows = filteredRows.filter((row) =>
				(row[header] || "").toLowerCase().includes(searchValue),
			);
		}
	}

	// Build CSV
	const headers = sheetData.headers;
	const csvRows = [
		headers.map(escapeCSV).join(","),
		...filteredRows.map((row) =>
			headers.map((h) => escapeCSV(row[h] || "")).join(","),
		),
	];

	const csv = `\uFEFF${csvRows.join("\n")}`;

	const date = new Date().toISOString().split("T")[0];
	const filename = `analytics-export-${date}.csv`;

	return new Response(csv, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
		},
	});
}

function escapeCSV(value: string): string {
	if (!value) return "";
	if (value.includes(",") || value.includes("\n") || value.includes('"')) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}
