import { getDatabase, type News } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { buildCsvResponse, escapeCSV } from "~/lib/csv-utils";
import type { Route } from "./+types/_index";

/**
 * Export news as CSV (requires news:read)
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "news:export", getDatabase);

	const db = getDatabase();
	const items = await db.getNews();
	const sorted = items.sort(
		(a, b) =>
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	const headers = [
		"id",
		"title",
		"summary",
		"content",
		"titleSecondary",
		"summarySecondary",
		"contentSecondary",
		"status",
		"createdBy",
		"createdAt",
		"updatedAt",
	];

	const rows = sorted.map((n: News) => {
		return [
			n.id,
			escapeCSV(n.title),
			escapeCSV(n.summary ?? ""),
			escapeCSV(n.content),
			escapeCSV(n.titleSecondary ?? ""),
			escapeCSV(n.summarySecondary ?? ""),
			escapeCSV(n.contentSecondary ?? ""),
			n.status,
			n.createdBy ?? "",
			n.createdAt ? new Date(n.createdAt).toISOString() : "",
			n.updatedAt ? new Date(n.updatedAt).toISOString() : "",
		].join(",");
	});

	const date = new Date().toISOString().split("T")[0];

	return buildCsvResponse([headers.join(","), ...rows], `news-${date}.csv`);
}
