import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	redirect,
} from "react-router";
import { getDatabase } from "~/db";
import { requireDeletePermissionOrSelf } from "~/lib/auth.server";

export async function loader({
	request: _request,
	params,
}: LoaderFunctionArgs) {
	// This route only handles POST/DELETE requests via action
	return new Response(JSON.stringify({ error: "Method not allowed" }), {
		status: 405,
		headers: {
			"Content-Type": "application/json",
			Allow: "POST, DELETE",
		},
	});
}

export async function action({ request, params }: ActionFunctionArgs) {
	const { budgetId } = params;

	let jsonData: any = null;
	try {
		jsonData = await request.json();
	} catch {
		// Ignore JSON parse errors
	}

	if (request.method !== "DELETE" && request.method !== "POST") {
		return new Response(JSON.stringify({ error: "Method not allowed" }), {
			status: 405,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (!budgetId) {
		return new Response(JSON.stringify({ error: "Budget ID is required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const db = getDatabase();
	const budget = await db.getFundBudgetById(budgetId);

	if (!budget) {
		return new Response(JSON.stringify({ error: "Budget not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	}

	await requireDeletePermissionOrSelf(
		request,
		"treasury:budgets:delete",
		"treasury:budgets:delete-self",
		budget.createdBy,
		getDatabase,
	);

	// Check for used amount
	const usedAmount = await db.getBudgetUsedAmount(budget.id);
	if (usedAmount > 0) {
		return new Response(
			JSON.stringify({
				error:
					"Cannot delete a budget that has linked transactions. Remove or relocate the transactions first.",
			}),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	try {
		await db.deleteFundBudget(budget.id);
		const returnUrl = jsonData?._returnUrl as string | null;
		if (returnUrl) {
			return redirect(returnUrl);
		}
		return Response.json({ success: true });
	} catch (error) {
		console.error("[api.budgets.delete]", error);
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "Delete failed",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}
