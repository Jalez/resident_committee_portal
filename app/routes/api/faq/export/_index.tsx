import { getDatabase, type Faq } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { buildCsvResponse, escapeCSV } from "~/lib/csv-utils";
import type { Route } from "./+types/_index";

/**
 * Export FAQs as CSV (requires faq:read)
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "faq:export", getDatabase);

	const db = getDatabase();
	const faqs = await db.getFaqs();
	const sorted = faqs.sort((a, b) => a.sortOrder - b.sortOrder);

	const headers = [
		"id",
		"question",
		"answer",
		"questionSecondary",
		"answerSecondary",
		"sortOrder",
		"status",
		"createdAt",
		"updatedAt",
	];

	const rows = sorted.map((f: Faq) => {
		return [
			f.id,
			escapeCSV(f.question),
			escapeCSV(f.answer),
			escapeCSV(f.questionSecondary ?? ""),
			escapeCSV(f.answerSecondary ?? ""),
			f.sortOrder,
			f.status,
			f.createdAt ? new Date(f.createdAt).toISOString() : "",
			f.updatedAt ? new Date(f.updatedAt).toISOString() : "",
		].join(",");
	});

	const date = new Date().toISOString().split("T")[0];

	return buildCsvResponse([headers.join(","), ...rows], `faq-${date}.csv`);
}
