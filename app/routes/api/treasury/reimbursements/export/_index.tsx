import { getDatabase, type Purchase } from "~/db/server.server";
import {
	hasAnyPermission,
	type RBACDatabaseAdapter,
	requireAnyPermission,
} from "~/lib/auth.server";
import { buildCsvResponse, escapeCSV } from "~/lib/csv-utils";
import type { Route } from "./+types/_index";

/**
 * Export reimbursements (purchases) as CSV (requires treasury:reimbursements:export)
 */
export async function loader({ request }: Route.LoaderArgs) {
	const user = await requireAnyPermission(
		request,
		[
			"treasury:reimbursements:export",
			"treasury:reimbursements:read",
			"treasury:reimbursements:read-self",
		],
		getDatabase as unknown as () => RBACDatabaseAdapter,
	);

	const canReadAll = hasAnyPermission(user, [
		"treasury:reimbursements:read",
		"treasury:reimbursements:export",
	]);

	const db = getDatabase();
	const url = new URL(request.url);
	const statusParam = url.searchParams.get("status") || "all";
	const yearParam = url.searchParams.get("year") || String(new Date().getFullYear());

	let purchases = await db.getPurchases();

	if (!canReadAll) {
		purchases = purchases.filter((p) => p.createdBy === user.userId);
	}

	if (yearParam !== "all") {
		const year = parseInt(yearParam, 10);
		if (!Number.isNaN(year)) {
			purchases = purchases.filter((p) => p.year === year);
		}
	}

	if (statusParam !== "all") {
		purchases = purchases.filter((p) => p.status === statusParam);
	}

	purchases = purchases.sort(
		(a, b) =>
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	const headers = [
		"id",
		"description",
		"amount",
		"purchaserName",
		"bankAccount",
		"minutesId",
		"minutesName",
		"notes",
		"status",
		"year",
		"createdBy",
		"createdAt",
		"updatedAt",
	];

	const rows = purchases.map((p: Purchase) => {
		return [
			p.id,
			escapeCSV(p.description ?? ""),
			p.amount,
			escapeCSV(p.purchaserName),
			escapeCSV(p.bankAccount),
			escapeCSV(p.minutesId),
			escapeCSV(p.minutesName ?? ""),
			escapeCSV(p.notes ?? ""),
			p.status,
			p.year,
			p.createdBy ?? "",
			p.createdAt ? new Date(p.createdAt).toISOString() : "",
			p.updatedAt ? new Date(p.updatedAt).toISOString() : "",
		].join(",");
	});

	const date = new Date().toISOString().split("T")[0];
	const filename = `reimbursements-${date}.csv`;

	return buildCsvResponse([headers.join(","), ...rows], filename);
}
