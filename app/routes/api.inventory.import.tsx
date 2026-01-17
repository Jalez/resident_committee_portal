import type { Route } from "./+types/api.inventory.import";
import { getDatabase, type NewInventoryItem } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import * as XLSX from "xlsx";

/**
 * Import inventory items from CSV or Excel (requires inventory:import permission)
 * Expects multipart form data with a "file" field containing CSV or XLSX
 */
export async function action({ request }: Route.ActionArgs) {
    // Requires inventory:import permission
    await requirePermission(request, "inventory:import", getDatabase);

    const db = getDatabase();

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return Response.json(
                { success: false, error: "No file uploaded" },
                { status: 400 }
            );
        }

        const fileName = file.name.toLowerCase();
        const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
        const isCSV = fileName.endsWith(".csv");

        if (!isExcel && !isCSV) {
            return Response.json(
                { success: false, error: "Please upload a CSV or Excel (.xlsx) file" },
                { status: 400 }
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
                    { status: 400 }
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
                { status: 400 }
            );
        }

        // Parse rows into inventory items
        const items: NewInventoryItem[] = [];
        const errors: string[] = [];

        for (let i = 0; i < rows.length; i++) {
            try {
                const row = rows[i];

                // Get values (support multiple column name formats)
                const name = getColumn(row, ["Item Name", "name", "Name"]) as string;
                const location = getColumn(row, ["Location", "location"]) as string;

                if (!name || !location) {
                    errors.push(`Row ${i + 2}: Missing name or location`);
                    continue;
                }

                const quantityRaw = getColumn(row, ["Quantity", "quantity"]);
                const categoryRaw = getColumn(row, ["Category", "category"]);
                const descriptionRaw = getColumn(row, ["Description", "description"]);
                const valueRaw = getColumn(row, ["Value", "value"]);
                const purchasedRaw = getColumn(row, ["Purchased", "purchasedAt", "purchased_at"]);

                const item: NewInventoryItem = {
                    name: String(name).trim(),
                    location: String(location).trim(),
                    quantity: quantityRaw ? parseInt(String(quantityRaw)) || 1 : 1,
                    category: categoryRaw ? String(categoryRaw).trim() || null : null,
                    description: descriptionRaw ? String(descriptionRaw).trim() || null : null,
                    value: valueRaw ? String(valueRaw).trim() || "0" : "0",
                    purchasedAt: purchasedRaw ? parseDate(purchasedRaw) : null,
                };

                items.push(item);
            } catch (err) {
                errors.push(`Row ${i + 2}: Parse error`);
            }
        }

        if (items.length === 0) {
            return Response.json(
                { success: false, error: "No valid items found", details: errors },
                { status: 400 }
            );
        }

        // Bulk create items
        const created = await db.bulkCreateInventoryItems(items);

        return Response.json({
            success: true,
            imported: created.length,
            errors: errors.length > 0 ? errors : undefined,
        });

    } catch (error) {
        console.error("[Import] Error:", error);
        return Response.json(
            { success: false, error: "Failed to process file" },
            { status: 500 }
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
        if (row[name.toLowerCase()] !== undefined && row[name.toLowerCase()] !== null && row[name.toLowerCase()] !== "") {
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
        const date = new Date(value.trim());
        return isNaN(date.getTime()) ? null : date;
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
