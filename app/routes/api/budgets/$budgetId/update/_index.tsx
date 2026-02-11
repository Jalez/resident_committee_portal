import { type ActionFunctionArgs, redirect } from "react-router";
import { z } from "zod";
import { getDatabase } from "~/db";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { getDraftAutoPublishStatus } from "~/lib/draft-auto-publish";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";

const updateBudgetSchema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string().optional(),
	amount: z.string().regex(/^\d+([,.]\d{1,2})?$/, "Invalid amount"),
});

export async function action({ request, params }: ActionFunctionArgs) {
	const { budgetId } = params;
	if (!budgetId) throw new Response("Budget ID required", { status: 400 });

	const db = getDatabase();
	const budget = await db.getFundBudgetById(budgetId);
	if (!budget) {
		throw new Response("Not Found", { status: 404 });
	}

	const user = await requirePermissionOrSelf(
		request,
		"treasury:budgets:update",
		"treasury:budgets:update-self",
		budget.createdBy,
		getDatabase,
	);

	const formData = await request.formData();
	const actionType = formData.get("_action") as string | null;

	if (actionType === "close") {
		await db.updateFundBudget(budgetId, { status: "closed" });
		return redirect(`/treasury/budgets/${budgetId}?success=closed`);
	}

	if (actionType === "reopen") {
		await db.updateFundBudget(budgetId, { status: "open" });
		return redirect(`/treasury/budgets/${budgetId}?success=reopened`);
	}

	const name = formData.get("name") as string;
	const description = formData.get("description") as string;
	const amountStr = formData.get("amount") as string;

	const result = updateBudgetSchema.safeParse({
		name,
		description,
		amount: amountStr,
	});

	if (!result.success) {
		return {
			error: "Validation failed",
			fieldErrors: result.error.flatten().fieldErrors,
		};
	}

	const newAmount = Number.parseFloat(amountStr.replace(",", "."));
	const usedAmount = await db.getBudgetUsedAmount(budgetId);

	if (newAmount < usedAmount) {
		return { error: "cannot_reduce", usedAmount };
	}

	const currentAmount = Number.parseFloat(budget.amount);
	if (newAmount > currentAmount) {
		const increase = newAmount - currentAmount;
		const availableFunds = await db.getAvailableFundsForYear(budget.year);

		if (increase > availableFunds) {
			return { error: "insufficient_funds", availableFunds };
		}
	}

	await db.updateFundBudget(budgetId, {
		name,
		description: description || null,
		amount: newAmount.toFixed(2),
	});

	// Auto-publish draft if all required fields are filled
	if (budget.status === "draft") {
		const newStatus = getDraftAutoPublishStatus("budget", budget.status, {
			name,
			amount: newAmount.toFixed(2),
		});
		if (newStatus) {
			await db.updateFundBudget(budgetId, { status: newStatus as any });
		}
	}

	// Save relationships using new universal system
	await saveRelationshipChanges(
		db,
		"budget",
		budgetId,
		formData,
		user?.userId || null,
	);

	// Check for source context to create auto-link
	const sourceType = formData.get("_sourceType") as string | null;
	const sourceId = formData.get("_sourceId") as string | null;
	if (sourceType && sourceId) {
		const exists = await db.entityRelationshipExists(
			sourceType as any,
			sourceId,
			"budget",
			budgetId,
		);
		if (!exists) {
			await db.createEntityRelationship({
				relationAType: sourceType as any,
				relationId: sourceId,
				relationBType: "budget",
				relationBId: budgetId,
				createdBy: user?.userId || null,
			});
		}
	}

	// Handle returnUrl redirect (from source entity picker)
	const returnUrl = formData.get("_returnUrl") as string | null;
	if (returnUrl) {
		return redirect(returnUrl);
	}

	return redirect(`/treasury/budgets/${budgetId}?success=updated`);
}
