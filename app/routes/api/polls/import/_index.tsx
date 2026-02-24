import { getDatabase, type NewPoll } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import {
	getColumnFromRow,
	parseFileToRows,
} from "~/lib/import-parse.server";
import type { Route } from "./+types/_index";

/**
 * Import polls from CSV or Excel (requires polls:write)
 */
export async function action({ request }: Route.ActionArgs) {
	const user = await requirePermission(request, "polls:import", getDatabase);
	const db = getDatabase();

	try {
		const formData = await request.formData();
		const file = formData.get("file") as File;
		const yearParam = formData.get("year") as string;

		const year = yearParam
			? parseInt(yearParam, 10)
			: new Date().getFullYear();
		if (Number.isNaN(year) || year < 2000 || year > 2100) {
			return Response.json(
				{ success: false, error: "Invalid year" },
				{ status: 400 },
			);
		}

		const result = await parseFileToRows(file);
		if (!result.ok) return result.error;
		const rows = result.rows;

		const polls: NewPoll[] = [];
		const errors: string[] = [];

		for (let i = 0; i < rows.length; i++) {
			try {
				const row = rows[i];
				const name = getColumnFromRow(row, [
					"name",
					"Name",
					"Nimi",
				]) as string;
				const externalUrl = getColumnFromRow(row, [
					"externalUrl",
					"external_url",
					"url",
				]) as string;
				if (!name || String(name).trim() === "") {
					errors.push(`Row ${i + 2}: Missing name`);
					continue;
				}
				if (externalUrl == null || String(externalUrl).trim() === "") {
					errors.push(`Row ${i + 2}: Missing external URL`);
					continue;
				}
				const description = getColumnFromRow(row, [
					"description",
					"Description",
				]);
				const poll: NewPoll = {
					name: String(name).trim(),
					externalUrl: String(externalUrl).trim(),
					year,
					description:
						description != null && String(description).trim() !== ""
							? String(description).trim()
							: null,
					type: "external",
					status: "active",
					createdBy: user.userId,
				};
				polls.push(poll);
			} catch (_err) {
				errors.push(`Row ${i + 2}: Parse error`);
			}
		}

		if (polls.length === 0) {
			return Response.json(
				{
					success: false,
					error: "No valid polls found",
					details: errors,
				},
				{ status: 400 },
			);
		}

		const created: unknown[] = [];
		for (const p of polls) {
			const result = await db.createPoll(p);
			created.push(result);
		}

		return Response.json({
			success: true,
			imported: created.length,
			errors: errors.length > 0 ? errors : undefined,
		});
	} catch (error) {
		console.error("[Polls Import] Error:", error);
		return Response.json(
			{ success: false, error: "Failed to process file" },
			{ status: 500 },
		);
	}
}
