import { getDatabase, type NewEvent } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import {
	getColumnFromRow,
	parseFileToRows,
} from "~/lib/import-parse.server";
import type { Route } from "./+types/_index";

/**
 * Import events from CSV or Excel (requires events:write)
 */
export async function action({ request }: Route.ActionArgs) {
	const user = await requirePermission(request, "events:import", getDatabase);
	const db = getDatabase();

	try {
		const formData = await request.formData();
		const file = formData.get("file") as File;

		const result = await parseFileToRows(file);
		if (!result.ok) return result.error;
		const rows = result.rows;

		const events: NewEvent[] = [];
		const errors: string[] = [];

		for (let i = 0; i < rows.length; i++) {
			try {
				const row = rows[i];
				const title = getColumnFromRow(row, [
					"title",
					"Title",
					"Otsikko",
				]) as string;
				const startRaw = getColumnFromRow(row, [
					"startDate",
					"start_date",
					"date",
				]);
				if (!title || String(title).trim() === "") {
					errors.push(`Row ${i + 2}: Missing title`);
					continue;
				}
				if (!startRaw) {
					errors.push(`Row ${i + 2}: Missing start date`);
					continue;
				}
				const startDate = parseDate(startRaw);
				if (!startDate) {
					errors.push(`Row ${i + 2}: Invalid start date`);
					continue;
				}
				const endRaw = getColumnFromRow(row, ["endDate", "end_date"]);
				let endDate: Date | null = null;
				if (endRaw) endDate = parseDate(endRaw);

				const event: NewEvent = {
					title: String(title).trim(),
					startDate,
					endDate: endDate ?? undefined,
					description:
						getColumnFromRow(row, ["description", "Description"]) != null
							? String(
									getColumnFromRow(row, ["description", "Description"]),
								).trim()
							: undefined,
					location:
						getColumnFromRow(row, ["location", "Location"]) != null
							? String(
									getColumnFromRow(row, ["location", "Location"]),
								).trim()
							: undefined,
					isAllDay: false,
					eventType: "social",
					status: "active",
					createdBy: user.userId,
				};
				events.push(event);
			} catch (_err) {
				errors.push(`Row ${i + 2}: Parse error`);
			}
		}

		if (events.length === 0) {
			return Response.json(
				{
					success: false,
					error: "No valid events found",
					details: errors,
				},
				{ status: 400 },
			);
		}

		const created: unknown[] = [];
		for (const ev of events) {
			const result = await db.createEvent(ev);
			created.push(result);
		}

		return Response.json({
			success: true,
			imported: created.length,
			errors: errors.length > 0 ? errors : undefined,
		});
	} catch (error) {
		console.error("[Events Import] Error:", error);
		return Response.json(
			{ success: false, error: "Failed to process file" },
			{ status: 500 },
		);
	}
}

function parseDate(value: unknown): Date | null {
	if (!value) return null;
	if (typeof value === "number") {
		const excelEpoch = new Date(1899, 11, 30);
		return new Date(
			excelEpoch.getTime() + value * 24 * 60 * 60 * 1000,
		);
	}
	if (typeof value === "string") {
		const d = new Date(value.trim());
		return Number.isNaN(d.getTime()) ? null : d;
	}
	return null;
}
