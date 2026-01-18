import type { Route } from "./+types/api.treasury.export";
import { getDatabase, type Transaction } from "~/db";
import { requirePermission } from "~/lib/auth.server";

/**
 * Export treasury transactions as CSV (requires treasury:view permission)
 */
export async function loader({ request }: Route.LoaderArgs) {
    // Requires treasury:read permission
    await requirePermission(request, "treasury:read", getDatabase);

    const db = getDatabase();
    const url = new URL(request.url);
    const yearParam = url.searchParams.get("year");
    const currentYear = new Date().getFullYear();
    const year = yearParam ? parseInt(yearParam) : currentYear;

    if (isNaN(year) || year < 2000 || year > 2100) {
        throw new Response("Invalid year", { status: 400 });
    }

    const allTransactionsForYear = await db.getTransactionsByYear(year);

    // Filter out pending/declined reimbursements - logic matches treasury.breakdown.tsx
    const transactions = allTransactionsForYear.filter(t =>
        !t.reimbursementStatus ||
        t.reimbursementStatus === "not_requested" ||
        t.reimbursementStatus === "approved"
    );

    // Sort by date descending
    const sortedTransactions = transactions.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // CSV header
    const headers = [
        "id",
        "date",
        "description",
        "category",
        "type",
        "amount",
        "status",
        "reimbursementStatus",
        // "purchaser", // Not directly available
        "createdAt"
    ];

    // Convert transactions to CSV rows
    const rows = sortedTransactions.map((t: Transaction) => {
        return [
            t.id,
            t.date ? new Date(t.date).toISOString().split("T")[0] : "",
            escapeCSV(t.description),
            escapeCSV(t.category || ""),
            t.type,
            t.amount,
            t.status,
            t.reimbursementStatus || "",
            // Purchaser is not vertically available on strict Transaction type without join, skipping for now
            // t.purchaseId ? "Yes" : "",
            t.createdAt ? new Date(t.createdAt).toISOString() : "",
        ].join(",");
    });

    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");

    const filename = `transactions-${year}.csv`;

    return new Response(csv, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
        },
    });
}

function escapeCSV(value: string): string {
    if (!value) return "";
    // If value contains comma, newline, or quote, wrap in quotes and escape quotes
    if (value.includes(",") || value.includes("\n") || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
