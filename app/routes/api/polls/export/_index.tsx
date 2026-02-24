import { getDatabase, type Poll } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { buildCsvResponse, escapeCSV } from "~/lib/csv-utils";
import type { Route } from "./+types/_index";

/**
 * Export polls as CSV (requires polls:read)
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "polls:export", getDatabase);

	const db = getDatabase();
	const polls = await db.getPolls();
	const sorted = polls.sort(
		(a, b) =>
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	const headers = [
		"id",
		"name",
		"description",
		"type",
		"googleFormId",
		"externalUrl",
		"analyticsSheetId",
		"deadline",
		"status",
		"year",
		"createdBy",
		"createdAt",
		"updatedAt",
	];

	const rows = sorted.map((p: Poll) => {
		return [
			p.id,
			escapeCSV(p.name),
			escapeCSV(p.description ?? ""),
			p.type,
			escapeCSV(p.googleFormId ?? ""),
			escapeCSV(p.externalUrl),
			escapeCSV(p.analyticsSheetId ?? ""),
			p.deadline ? new Date(p.deadline).toISOString() : "",
			p.status,
			p.year,
			p.createdBy ?? "",
			p.createdAt ? new Date(p.createdAt).toISOString() : "",
			p.updatedAt ? new Date(p.updatedAt).toISOString() : "",
		].join(",");
	});

	const date = new Date().toISOString().split("T")[0];

	return buildCsvResponse([headers.join(","), ...rows], `polls-${date}.csv`);
}
