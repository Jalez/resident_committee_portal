import { getDatabase, type Minute } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { buildCsvResponse, escapeCSV } from "~/lib/csv-utils";
import type { Route } from "./+types/_index";

/**
 * Export minutes list as CSV (requires minutes:read)
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "minutes:export", getDatabase);

	const db = getDatabase();
	const url = new URL(request.url);
	const yearParam = url.searchParams.get("year");

	let minutes = await db.getMinutes();
	if (yearParam && yearParam !== "all") {
		const year = parseInt(yearParam, 10);
		if (!Number.isNaN(year)) {
			minutes = minutes.filter((m) => m.year === year);
		}
	}

	minutes = minutes.sort(
		(a, b) =>
			new Date(b.date || b.createdAt).getTime() -
			new Date(a.date || a.createdAt).getTime(),
	);

	const headers = [
		"id",
		"title",
		"description",
		"date",
		"year",
		"status",
		"createdBy",
		"createdAt",
		"updatedAt",
	];

	const rows = minutes.map((m: Minute) => {
		return [
			m.id,
			escapeCSV(m.title ?? ""),
			escapeCSV(m.description ?? ""),
			m.date ? new Date(m.date).toISOString().split("T")[0] : "",
			m.year ?? "",
			m.status,
			m.createdBy ?? "",
			m.createdAt ? new Date(m.createdAt).toISOString() : "",
			m.updatedAt ? new Date(m.updatedAt).toISOString() : "",
		].join(",");
	});

	const date = new Date().toISOString().split("T")[0];

	return buildCsvResponse([headers.join(","), ...rows], `minutes-${date}.csv`);
}
