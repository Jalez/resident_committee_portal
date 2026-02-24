import { getDatabase, type NewFundBudget } from "~/db/server.server";
import {
	type RBACDatabaseAdapter,
	requireAnyPermission,
} from "~/lib/auth.server";
import {
	getColumnFromRow,
	parseFileToRows,
} from "~/lib/import-parse.server";
import type { Route } from "./+types/_index";

/**
 * Import fund budgets from CSV or Excel (requires treasury:budgets:import)
 */
export async function action({ request }: Route.ActionArgs) {
	const user = await requireAnyPermission(
		request,
		["treasury:budgets:import", "treasury:budgets:write"],
		getDatabase as unknown as () => RBACDatabaseAdapter,
	);

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

		const budgets: NewFundBudget[] = [];
		const errors: string[] = [];

		for (let i = 0; i < rows.length; i++) {
			try {
				const row = rows[i];
				const name = getColumnFromRow(row, [
					"name",
					"Name",
					"Nimi",
				]) as string;
				const amountRaw = getColumnFromRow(row, [
					"amount",
					"Amount",
					"Summa",
				]);
				const descriptionRaw = getColumnFromRow(row, [
					"description",
					"Description",
					"Kuvaus",
				]);
				const statusRaw = getColumnFromRow(row, [
					"status",
					"Status",
					"Tila",
				]);

				if (!name || String(name).trim() === "") {
					errors.push(`Row ${i + 2}: Missing name`);
					continue;
				}

				if (!amountRaw) {
					errors.push(`Row ${i + 2}: Missing amount`);
					continue;
				}

				let amount = String(amountRaw).replace(",", ".").trim();
				amount = amount.replace(/[€$]/g, "").trim();
				const amountNum = parseFloat(amount);
				if (Number.isNaN(amountNum) || amountNum < 0) {
					errors.push(`Row ${i + 2}: Invalid amount "${amountRaw}"`);
					continue;
				}

				let status: "draft" | "open" | "closed" = "open";
				if (statusRaw) {
					const s = String(statusRaw).toLowerCase().trim();
					if (s === "draft" || s === "luonnos") status = "draft";
					else if (s === "closed" || s === "suljettu") status = "closed";
				}

				const budget: NewFundBudget = {
					name: String(name).trim(),
					amount: amountNum.toFixed(2),
					year,
					description:
						descriptionRaw != null && String(descriptionRaw).trim() !== ""
							? String(descriptionRaw).trim()
							: null,
					status,
					createdBy: user.userId,
				};
				budgets.push(budget);
			} catch (_err) {
				errors.push(`Row ${i + 2}: Parse error`);
			}
		}

		if (budgets.length === 0) {
			return Response.json(
				{
					success: false,
					error: "No valid budgets found",
					details: errors,
				},
				{ status: 400 },
			);
		}

		const created: unknown[] = [];
		for (const b of budgets) {
			const result = await db.createFundBudget(b);
			created.push(result);
		}

		return Response.json({
			success: true,
			imported: created.length,
			errors: errors.length > 0 ? errors : undefined,
		});
	} catch (error) {
		console.error("[Treasury Budgets Import] Error:", error);
		return Response.json(
			{ success: false, error: "Failed to process file" },
			{ status: 500 },
		);
	}
}
