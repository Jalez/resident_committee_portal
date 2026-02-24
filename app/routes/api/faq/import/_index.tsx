import { getDatabase, type NewFaq } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import {
	getColumnFromRow,
	parseFileToRows,
} from "~/lib/import-parse.server";
import type { Route } from "./+types/_index";

/**
 * Import FAQs from CSV or Excel (requires faq:import)
 */
export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "faq:import", getDatabase);
	const db = getDatabase();

	try {
		const formData = await request.formData();
		const file = formData.get("file") as File;

		const result = await parseFileToRows(file);
		if (!result.ok) return result.error;
		const rows = result.rows;

		const faqs: NewFaq[] = [];
		const errors: string[] = [];

		for (let i = 0; i < rows.length; i++) {
			try {
				const row = rows[i];
				const question = getColumnFromRow(row, [
					"question",
					"Question",
					"Kysymys",
				]) as string;
				const answer = getColumnFromRow(row, [
					"answer",
					"Answer",
					"Vastaus",
				]) as string;
				if (!question || String(question).trim() === "") {
					errors.push(`Row ${i + 2}: Missing question`);
					continue;
				}
				if (answer == null || String(answer).trim() === "") {
					errors.push(`Row ${i + 2}: Missing answer`);
					continue;
				}
				const sortOrderRaw = getColumnFromRow(row, [
					"sortOrder",
					"sort_order",
				]);
				const sortOrder =
					sortOrderRaw != null && sortOrderRaw !== ""
						? parseInt(String(sortOrderRaw), 10)
						: i;

				const faq: NewFaq = {
					question: String(question).trim(),
					answer: String(answer ?? "").trim(),
					sortOrder: Number.isNaN(sortOrder) ? i : sortOrder,
					status: "active",
				};
				faqs.push(faq);
			} catch (_err) {
				errors.push(`Row ${i + 2}: Parse error`);
			}
		}

		if (faqs.length === 0) {
			return Response.json(
				{
					success: false,
					error: "No valid FAQs found",
					details: errors,
				},
				{ status: 400 },
			);
		}

		const created: unknown[] = [];
		for (const f of faqs) {
			const result = await db.createFaq(f);
			created.push(result);
		}

		return Response.json({
			success: true,
			imported: created.length,
			errors: errors.length > 0 ? errors : undefined,
		});
	} catch (error) {
		console.error("[FAQ Import] Error:", error);
		return Response.json(
			{ success: false, error: "Failed to process file" },
			{ status: 500 },
		);
	}
}
