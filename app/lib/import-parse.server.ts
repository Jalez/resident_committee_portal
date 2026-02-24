import * as XLSX from "xlsx";
import { parseCSVLine } from "~/lib/csv-utils";

export type ParseFileResult =
	| { ok: true; rows: Record<string, unknown>[] }
	| { ok: false; error: Response };

/**
 * Parse an uploaded file (CSV or Excel) into an array of row objects.
 * Validates file type and returns a result or error Response.
 */
export async function parseFileToRows(file: File | null): Promise<ParseFileResult> {
	if (!file) {
		return {
			ok: false,
			error: Response.json(
				{ success: false, error: "No file uploaded" },
				{ status: 400 },
			),
		};
	}

	const fileName = file.name.toLowerCase();
	const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
	const isCSV = fileName.endsWith(".csv");

	if (!isExcel && !isCSV) {
		return {
			ok: false,
			error: Response.json(
				{ success: false, error: "Please upload a CSV or Excel (.xlsx) file" },
				{ status: 400 },
			),
		};
	}

	let rows: Record<string, unknown>[] = [];

	if (isExcel) {
		const arrayBuffer = await file.arrayBuffer();
		const workbook = XLSX.read(arrayBuffer, { type: "array" });
		const firstSheetName = workbook.SheetNames[0];
		const worksheet = workbook.Sheets[firstSheetName];
		rows = XLSX.utils.sheet_to_json(worksheet);
	} else {
		const text = await file.text();
		const lines = text.trim().split("\n");

		if (lines.length < 2) {
			return {
				ok: false,
				error: Response.json(
					{ success: false, error: "CSV file is empty or has no data rows" },
					{ status: 400 },
				),
			};
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
		return {
			ok: false,
			error: Response.json(
				{ success: false, error: "File is empty or has no data rows" },
				{ status: 400 },
			),
		};
	}

	return { ok: true, rows };
}

/**
 * Get a column value from a row by trying multiple possible column names
 * (e.g. "name", "Name", "Nimi"). Also tries lowercase variant.
 */
export function getColumnFromRow(
	row: Record<string, unknown>,
	names: string[],
): unknown {
	for (const name of names) {
		if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
			return row[name];
		}
		const lower = name.toLowerCase();
		if (
			row[lower] !== undefined &&
			row[lower] !== null &&
			row[lower] !== ""
		) {
			return row[lower];
		}
	}
	return null;
}
