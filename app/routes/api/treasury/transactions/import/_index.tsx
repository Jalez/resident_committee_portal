import { getDatabase, type NewTransaction } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import {
	getColumnFromRow,
	parseFileToRows,
} from "~/lib/import-parse.server";
import type { Route } from "./+types/_index";

/**
 * Import treasury transactions from CSV or Excel (requires treasury:transactions:import permission)
 * Expects multipart form data with a "file" field containing CSV or XLSX
 * and a "year" field specifying the target year
 */
export async function action({ request }: Route.ActionArgs) {
	const user = await requirePermission(
		request,
		"treasury:transactions:import",
		getDatabase,
	);

	const db = getDatabase();

	try {
		const formData = await request.formData();
		const file = formData.get("file") as File;
		const yearParam = formData.get("year") as string;

		const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
		if (Number.isNaN(year) || year < 2000 || year > 2100) {
			return Response.json(
				{ success: false, error: "Invalid year" },
				{ status: 400 },
			);
		}

		const result = await parseFileToRows(file);
		if (!result.ok) return result.error;
		const rows = result.rows;

		// Parse rows into transactions
		const transactions: NewTransaction[] = [];
		const errors: string[] = [];

		for (let i = 0; i < rows.length; i++) {
			try {
				const row = rows[i];

				// Get required values (support multiple column name formats)
				const description = getColumnFromRow(row, [
					"description",
					"Description",
					"Kuvaus",
					"kuvaus",
				]) as string;
				const amountRaw = getColumnFromRow(row, [
					"amount",
					"Amount",
					"Summa",
					"summa",
				]);
				const typeRaw = getColumnFromRow(row, [
					"type",
					"Type",
					"Tyyppi",
					"tyyppi",
				]);

				if (!description) {
					errors.push(`Row ${i + 2}: Missing description`);
					continue;
				}

				if (!amountRaw) {
					errors.push(`Row ${i + 2}: Missing amount`);
					continue;
				}

				// Parse amount - handle comma as decimal separator
				let amount = String(amountRaw).replace(",", ".").trim();
				// Remove currency symbols
				amount = amount.replace(/[€$]/g, "").trim();
				const amountNum = parseFloat(amount);
				if (Number.isNaN(amountNum) || amountNum <= 0) {
					errors.push(`Row ${i + 2}: Invalid amount "${amountRaw}"`);
					continue;
				}

				// Determine type (default to expense if not specified)
				let type: "income" | "expense" = "expense";
				if (typeRaw) {
					const typeStr = String(typeRaw).toLowerCase().trim();
					if (typeStr === "income" || typeStr === "tulo" || typeStr === "+") {
						type = "income";
					} else if (
						typeStr === "expense" ||
						typeStr === "meno" ||
						typeStr === "-"
					) {
						type = "expense";
					}
				}

				// Optional fields
				const dateRaw = getColumnFromRow(row, [
					"date",
					"Date",
					"Päivä",
					"päivä",
				]);
				const statusRaw = getColumnFromRow(row, [
					"status",
					"Status",
					"Tila",
					"tila",
				]);

				// Parse date (default to current date)
				let date = new Date();
				if (dateRaw) {
					const parsedDate = parseDate(dateRaw);
					if (parsedDate) {
						date = parsedDate;
					}
				}

				// Parse status (default to complete)
				let status: "pending" | "complete" | "paused" | "declined" = "complete";
				if (statusRaw) {
					const statusStr = String(statusRaw).toLowerCase().trim();
					if (statusStr === "pending" || statusStr === "odottaa") {
						status = "pending";
					} else if (statusStr === "paused" || statusStr === "tauolla") {
						status = "paused";
					} else if (statusStr === "declined" || statusStr === "hylätty") {
						status = "declined";
					}
				}

				const transaction: NewTransaction = {
					description: String(description).trim(),
					amount: amountNum.toFixed(2),
					type,
					year,
					date,
					status,
					reimbursementStatus: "not_requested",
					createdBy: user.userId,
				};

				transactions.push(transaction);
			} catch (_err) {
				errors.push(`Row ${i + 2}: Parse error`);
			}
		}

		if (transactions.length === 0) {
			return Response.json(
				{
					success: false,
					error: "No valid transactions found",
					details: errors,
				},
				{ status: 400 },
			);
		}

		// Create transactions one by one (no bulk method available)
		const created: unknown[] = [];
		for (const txn of transactions) {
			const result = await db.createTransaction(txn);
			created.push(result);
		}

		return Response.json({
			success: true,
			imported: created.length,
			errors: errors.length > 0 ? errors : undefined,
		});
	} catch (error) {
		console.error("[Treasury Import] Error:", error);
		return Response.json(
			{ success: false, error: "Failed to process file" },
			{ status: 500 },
		);
	}
}

/**
 * Parse a date from various formats (Excel serial, string, etc.)
 */
function parseDate(value: unknown): Date | null {
	if (!value) return null;

	// Excel serial date number
	if (typeof value === "number") {
		// Excel dates are days since 1900-01-01 (with a bug for 1900 leap year)
		const excelEpoch = new Date(1899, 11, 30);
		return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
	}

	// String date
	if (typeof value === "string") {
		const trimmed = value.trim();
		// Try ISO format first
		let date = new Date(trimmed);
		if (!Number.isNaN(date.getTime())) {
			return date;
		}
		// Try DD.MM.YYYY format (Finnish)
		const ddmmyyyy = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
		if (ddmmyyyy) {
			date = new Date(
				parseInt(ddmmyyyy[3], 10),
				parseInt(ddmmyyyy[2], 10) - 1,
				parseInt(ddmmyyyy[1], 10),
			);
			if (!Number.isNaN(date.getTime())) {
				return date;
			}
		}
		return null;
	}

	return null;
}
