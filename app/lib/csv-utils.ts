/**
 * Shared CSV utilities for export and import.
 * Used by API routes that return CSV downloads or parse uploaded CSV/Excel.
 */

/**
 * Escape a value for CSV: wrap in quotes and escape internal quotes if needed.
 */
export function escapeCSV(value: string): string {
	if (!value) return "";
	if (value.includes(",") || value.includes("\n") || value.includes('"')) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/**
 * Parse a single CSV line, handling quoted values and escaped quotes.
 */
export function parseCSVLine(line: string): string[] {
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

/**
 * Build a Response for CSV download with BOM and correct headers.
 * @param lines - First element is header line (joined), rest are data lines (each already joined).
 * @param filename - Suggested download filename.
 */
export function buildCsvResponse(lines: string[], filename: string): Response {
	const csv = `\uFEFF${lines.join("\n")}`;
	return new Response(csv, {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
		},
	});
}
