import { getDatabase, type Transaction } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import { buildCsvResponse, escapeCSV } from "~/lib/csv-utils";
import type { Route } from "./+types/_index";

/**
 * Export treasury transactions as CSV (requires treasury:transactions:export permission)
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "treasury:transactions:export", getDatabase);

	const db = getDatabase();
	const url = new URL(request.url);
	const yearParam = url.searchParams.get("year");
	const currentYear = new Date().getFullYear();
	const year = yearParam ? parseInt(yearParam, 10) : currentYear;

	if (Number.isNaN(year) || year < 2000 || year > 2100) {
		throw new Response("Invalid year", { status: 400 });
	}

	const allTransactionsForYear = await db.getTransactionsByYear(year);

	// Filter out pending/declined reimbursements - logic matches treasury.breakdown.tsx
	const transactions = allTransactionsForYear.filter(
		(t) =>
			!t.reimbursementStatus ||
			t.reimbursementStatus === "not_requested" ||
			t.reimbursementStatus === "approved",
	);

	// Sort by date descending
	const sortedTransactions = transactions.sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	);

	// CSV header
	const headers = [
		"id",
		"date",
		"description",
		"type",
		"amount",
		"status",
		"reimbursementStatus",
		"createdAt",
	];

	// Convert transactions to CSV rows
	const rows = sortedTransactions.map((t: Transaction) => {
		return [
			t.id,
			t.date ? new Date(t.date).toISOString().split("T")[0] : "",
			escapeCSV(t.description),
			t.type,
			t.amount,
			t.status,
			t.reimbursementStatus || "",
			t.createdAt ? new Date(t.createdAt).toISOString() : "",
		].join(",");
	});

	const filename = `transactions-${year}.csv`;

	return buildCsvResponse([headers.join(","), ...rows], filename);
}
