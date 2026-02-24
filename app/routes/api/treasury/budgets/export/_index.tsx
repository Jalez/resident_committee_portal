import { getDatabase, type FundBudget } from "~/db/server.server";
import {
	hasAnyPermission,
	type RBACDatabaseAdapter,
	requireAnyPermission,
} from "~/lib/auth.server";
import { buildCsvResponse, escapeCSV } from "~/lib/csv-utils";
import type { Route } from "./+types/_index";

/**
 * Export fund budgets as CSV (requires treasury:budgets:export)
 */
export async function loader({ request }: Route.LoaderArgs) {
	const user = await requireAnyPermission(
		request,
		["treasury:budgets:export", "treasury:budgets:read", "treasury:budgets:read-self"],
		getDatabase as unknown as () => RBACDatabaseAdapter,
	);

	const db = getDatabase();
	const url = new URL(request.url);
	const yearParam = url.searchParams.get("year");
	const currentYear = new Date().getFullYear();
	const year = yearParam ? parseInt(yearParam, 10) : currentYear;

	if (Number.isNaN(year) || year < 2000 || year > 2100) {
		throw new Response("Invalid year", { status: 400 });
	}

	let budgets = await db.getFundBudgetsByYear(year);

	// If user only has read-self, filter to own
	const canReadAll = hasAnyPermission(user, [
		"treasury:budgets:read",
		"treasury:budgets:export",
	]);
	if (!canReadAll) {
		budgets = budgets.filter((b) => b.createdBy === user.userId);
	}

	budgets = budgets.sort(
		(a, b) =>
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	const headers = [
		"id",
		"name",
		"description",
		"amount",
		"year",
		"status",
		"createdBy",
		"createdAt",
		"updatedAt",
	];

	const rows = budgets.map((b: FundBudget) => {
		return [
			b.id,
			escapeCSV(b.name),
			escapeCSV(b.description ?? ""),
			b.amount,
			b.year,
			b.status,
			b.createdBy ?? "",
			b.createdAt ? new Date(b.createdAt).toISOString() : "",
			b.updatedAt ? new Date(b.updatedAt).toISOString() : "",
		].join(",");
	});

	const filename = `budgets-${year}.csv`;

	return buildCsvResponse([headers.join(","), ...rows], filename);
}
