import * as XLSX from "xlsx";
import { getDatabase, type NewTransaction } from "~/db/server";
import { requirePermission } from "~/lib/auth.server";
import type { Route } from "./+types/_index";

/**
 * Import treasury transactions from CSV or Excel (requires treasury:import permission)
 * Expects multipart form data with a "file" field containing CSV or XLSX
 * and a "year" field specifying the target year
 */
export async function action({ request }: Route.ActionArgs) {
	// Requires treasury:import permission
	const user = await requirePermission(request, "treasury:import", getDatabase);

	const db = getDatabase();

	try {
		const formData = await request.formData();
		const file = formData.get("file") as File;
		const yearParam = formData.get("year") as string;

		if (!file) {
			return Response.json(
				{ success: false, error: "No file uploaded" },
				{ status: 400 },
			);
		}

		const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
		if (Number.isNaN(year) || year < 2000 || year > 2100) {
			return Response.json(
				{ success: false, error: "Invalid year" },
				{ status: 400 },
			);
		}

		const fileName = file.name.toLowerCase();
		const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
		const isCSV = fileName.endsWith(".csv");

		if (!isExcel && !isCSV) {
			return Response.json(
				{ success: false, error: "Please upload a CSV or Excel (.xlsx) file" },
				{ status: 400 },
			);
		}

		let rows: Record<string, unknown>[] = [];

		if (isExcel) {
			// Parse Excel file
			const arrayBuffer = await file.arrayBuffer();
			const workbook = XLSX.read(arrayBuffer, { type: "array" });
			const firstSheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[firstSheetName];
			rows = XLSX.utils.sheet_to_json(worksheet);
		} else {
			// Parse CSV file
			const text = await file.text();
			const lines = text.trim().split("\n");

			if (lines.length < 2) {
				return Response.json(
					{ success: false, error: "CSV file is empty or has no data rows" },
					{ status: 400 },
				);
			}

			const header = parseCSVLine(lines[0]);
			for (let i = 1; i < lines.length; i++) {
				const line = lines[i].trim();
				if (!line) continue;
				const values = parseCSVLine(line);
				const row: Record<string, unknown> = {};
				header.forEach((h, idx) => {
					row[h] = values[idx];
				});
				rows.push(row);
			}
		}

		if (rows.length === 0) {
			return Response.json(
				{ success: false, error: "File is empty or has no data rows" },
				{ status: 400 },
			);
		}

		// Parse rows into transactions
		const transactions: NewTransaction[] = [];
		const errors: string[] = [];

		for (let i = 0; i < rows.length; i++) {
			try {
				const row = rows[i];

				// Get required values (support multiple column name formats)
				const description = getColumn(row, [
					"description",
					"Description",
					"Kuvaus",
					"kuvaus",
				]) as string;
				const amountRaw = getColumn(row, [
					"amount",
					"Amount",
					"Summa",
					"summa",
				]);
				const typeRaw = getColumn(row, ["type", "Type", "Tyyppi", "tyyppi"]);

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
				const categoryRaw = getColumn(row, [
					"category",
					"Category",
					"Kategoria",
					"kategoria",
				]);
				const dateRaw = getColumn(row, ["date", "Date", "Päivä", "päivä"]);
				const statusRaw = getColumn(row, ["status", "Status", "Tila", "tila"]);

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
					category: categoryRaw ? String(categoryRaw).trim() || null : null,
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
 * Get column value by trying multiple possible column names
 */
function getColumn(row: Record<string, unknown>, names: string[]): unknown {
	for (const name of names) {
		if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
			return row[name];
		}
		// Try lowercase
		if (
			row[name.toLowerCase()] !== undefined &&
			row[name.toLowerCase()] !== null &&
			row[name.toLowerCase()] !== ""
		) {
			return row[name.toLowerCase()];
		}
	}
	return null;
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

/**
 * Parse a CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
	const result: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		const nextChar = line[i + 1];

		if (char === '"' && inQuotes && nextChar === '"') {
			current += '"';
			i++;
		} else if (char === '"') {
			inQuotes = !inQuotes;
		} else if (char === "," && !inQuotes) {
			result.push(current);
			current = "";
		} else {
			current += char;
		}
	}

	result.push(current);
	return result;
}
