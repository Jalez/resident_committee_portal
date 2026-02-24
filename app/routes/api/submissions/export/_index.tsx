import { getDatabase, type Submission } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { buildCsvResponse, escapeCSV } from "~/lib/csv-utils";
import type { Route } from "./+types/_index";

/**
 * Export submissions as CSV (requires submissions:read)
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "submissions:export", getDatabase);

	const db = getDatabase();
	const submissions = await db.getSubmissions();
	const sorted = submissions.sort(
		(a, b) =>
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	const headers = [
		"id",
		"type",
		"name",
		"email",
		"apartmentNumber",
		"message",
		"status",
		"createdAt",
		"updatedAt",
	];

	const rows = sorted.map((s: Submission) => {
		return [
			s.id,
			s.type,
			escapeCSV(s.name),
			escapeCSV(s.email),
			escapeCSV(s.apartmentNumber ?? ""),
			escapeCSV(s.message),
			escapeCSV(s.status),
			s.createdAt ? new Date(s.createdAt).toISOString() : "",
			s.updatedAt ? new Date(s.updatedAt).toISOString() : "",
		].join(",");
	});

	const date = new Date().toISOString().split("T")[0];

	return buildCsvResponse([headers.join(","), ...rows], `submissions-${date}.csv`);
}
