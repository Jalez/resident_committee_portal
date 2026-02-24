import { getDatabase, type Event } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { buildCsvResponse, escapeCSV } from "~/lib/csv-utils";
import type { Route } from "./+types/_index";

/**
 * Export events as CSV (requires events:read)
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "events:export", getDatabase);

	const db = getDatabase();
	const events = await db.getEvents();
	const sorted = events.sort(
		(a, b) =>
			new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
	);

	const headers = [
		"id",
		"title",
		"description",
		"location",
		"isAllDay",
		"startDate",
		"endDate",
		"eventType",
		"status",
		"createdBy",
		"createdAt",
		"updatedAt",
	];

	const rows = sorted.map((e: Event) => {
		return [
			e.id,
			escapeCSV(e.title),
			escapeCSV(e.description ?? ""),
			escapeCSV(e.location ?? ""),
			e.isAllDay,
			e.startDate ? new Date(e.startDate).toISOString() : "",
			e.endDate ? new Date(e.endDate).toISOString() : "",
			e.eventType,
			e.status,
			e.createdBy ?? "",
			e.createdAt ? new Date(e.createdAt).toISOString() : "",
			e.updatedAt ? new Date(e.updatedAt).toISOString() : "",
		].join(",");
	});

	const date = new Date().toISOString().split("T")[0];

	return buildCsvResponse([headers.join(","), ...rows], `events-${date}.csv`);
}
