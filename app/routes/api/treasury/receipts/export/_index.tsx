import { getDatabase, type Receipt } from "~/db/server.server";
import {
	hasAnyPermission,
	type RBACDatabaseAdapter,
	requireAnyPermission,
} from "~/lib/auth.server";
import { buildCsvResponse, escapeCSV } from "~/lib/csv-utils";
import type { Route } from "./+types/_index";

/**
 * Export receipt metadata as CSV (requires treasury:receipts:export)
 */
export async function loader({ request }: Route.LoaderArgs) {
	const user = await requireAnyPermission(
		request,
		["treasury:receipts:export", "treasury:receipts:read", "treasury:receipts:read-self"],
		getDatabase as unknown as () => RBACDatabaseAdapter,
	);

	const canReadAll = hasAnyPermission(user, [
		"treasury:receipts:read",
		"treasury:receipts:export",
	]);

	const db = getDatabase();
	let receipts = await db.getReceipts();

	if (!canReadAll) {
		receipts = receipts.filter((r) => r.createdBy === user.userId);
	}

	receipts = receipts.sort(
		(a, b) =>
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	const headers = [
		"id",
		"name",
		"description",
		"status",
		"pathname",
		"storeName",
		"totalAmount",
		"currency",
		"purchaseDate",
		"createdBy",
		"createdAt",
		"updatedAt",
	];

	const rows = receipts.map((r: Receipt) => {
		return [
			r.id,
			escapeCSV(r.name ?? ""),
			escapeCSV(r.description ?? ""),
			r.status,
			escapeCSV(r.pathname ?? ""),
			escapeCSV(r.storeName ?? ""),
			r.totalAmount ?? "",
			r.currency ?? "",
			r.purchaseDate
				? new Date(r.purchaseDate).toISOString().split("T")[0]
				: "",
			r.createdBy ?? "",
			r.createdAt ? new Date(r.createdAt).toISOString() : "",
			r.updatedAt ? new Date(r.updatedAt).toISOString() : "",
		].join(",");
	});

	const date = new Date().toISOString().split("T")[0];
	const filename = `receipts-${date}.csv`;

	return buildCsvResponse([headers.join(","), ...rows], filename);
}
