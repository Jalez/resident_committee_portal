import { getDatabase, type NewNews } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import {
	getColumnFromRow,
	parseFileToRows,
} from "~/lib/import-parse.server";
import type { Route } from "./+types/_index";

/**
 * Import news from CSV or Excel (requires news:write)
 */
export async function action({ request }: Route.ActionArgs) {
	const user = await requirePermission(request, "news:import", getDatabase);
	const db = getDatabase();

	try {
		const formData = await request.formData();
		const file = formData.get("file") as File;

		const result = await parseFileToRows(file);
		if (!result.ok) return result.error;
		const rows = result.rows;

		const items: NewNews[] = [];
		const errors: string[] = [];

		for (let i = 0; i < rows.length; i++) {
			try {
				const row = rows[i];
				const title = getColumnFromRow(row, [
					"title",
					"Title",
					"Otsikko",
				]) as string;
				const content = getColumnFromRow(row, [
					"content",
					"Content",
					"Sisältö",
				]) as string;
				if (!title || String(title).trim() === "") {
					errors.push(`Row ${i + 2}: Missing title`);
					continue;
				}
				if (content == null || String(content).trim() === "") {
					errors.push(`Row ${i + 2}: Missing content`);
					continue;
				}
				const summary = getColumnFromRow(row, ["summary", "Summary"]);
				const item: NewNews = {
					title: String(title).trim(),
					content: String(content).trim(),
					summary:
						summary != null && String(summary).trim() !== ""
							? String(summary).trim()
							: null,
					status: "active",
					createdBy: user.userId,
				};
				items.push(item);
			} catch (_err) {
				errors.push(`Row ${i + 2}: Parse error`);
			}
		}

		if (items.length === 0) {
			return Response.json(
				{
					success: false,
					error: "No valid news items found",
					details: errors,
				},
				{ status: 400 },
			);
		}

		const created: unknown[] = [];
		for (const n of items) {
			const result = await db.createNews(n);
			created.push(result);
		}

		return Response.json({
			success: true,
			imported: created.length,
			errors: errors.length > 0 ? errors : undefined,
		});
	} catch (error) {
		console.error("[News Import] Error:", error);
		return Response.json(
			{ success: false, error: "Failed to process file" },
			{ status: 500 },
		);
	}
}
