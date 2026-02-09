import type { Route } from "./+types/api.entities.create-draft";
import { redirect } from "react-router";
import { getDatabase } from "~/db";
import type { RelationshipEntityType } from "~/db/schema";
import { requireAnyPermission } from "~/lib/auth.server";

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData();
	const type = formData.get("type") as RelationshipEntityType;
	const returnUrl = formData.get("returnUrl") as string | null;
	const sourceType = formData.get("sourceType") as RelationshipEntityType | null;
	const sourceId = formData.get("sourceId") as string | null;
	const sourceName = formData.get("sourceName") as string | null;

	if (!type) {
		return { error: "Missing entity type" };
	}

	const db = getDatabase();

	// Check permissions - require appropriate write permission
	const permissionMap: Record<RelationshipEntityType, string[]> = {
		receipt: ["treasury:receipts:write"],
		transaction: ["treasury:transactions:write"],
		reimbursement: ["treasury:reimbursements:write"],
		budget: ["treasury:budgets:write"],
		inventory: ["inventory:write"],
		minute: ["minutes:write"],
		news: ["news:write"],
		faq: ["faq:write"],
	};

	const permissions = permissionMap[type] || ["admin"];
	const user = await requireAnyPermission(request, permissions, getDatabase);

	const userId = user.userId || null;

	let redirectUrl = "/";

	try {
		switch (type) {
			case "transaction": {
				const transaction = await db.createTransaction({
					amount: "0",
					date: new Date(),
					description: "",
					type: "expense",
					year: new Date().getFullYear(),
					status: "draft",
					createdBy: userId,
				});
				redirectUrl = `/treasury/transactions/${transaction.id}/edit`;
				break;
			}

			case "receipt": {
				const receipt = await db.createReceipt({
					status: "draft",
					createdBy: userId,
				});
				redirectUrl = `/treasury/receipts/${receipt.id}/edit`;
				break;
			}

			case "reimbursement": {
				const reimbursement = await db.createPurchase({
					amount: "0",
					year: new Date().getFullYear(),
					purchaserName: "",
					bankAccount: "",
					minutesId: "",
					status: "draft",
					createdBy: userId,
				});
				redirectUrl = `/treasury/reimbursements/${reimbursement.id}/edit`;
				break;
			}

			case "budget": {
				const budget = await db.createFundBudget({
					amount: "0",
					name: "",
					year: new Date().getFullYear(),
					status: "draft",
					createdBy: userId,
				});
				redirectUrl = `/treasury/budgets/${budget.id}/edit`;
				break;
			}

			case "inventory": {
				const item = await db.createInventoryItem({
					name: "",
					status: "draft",
				});
				redirectUrl = `/inventory/${item.id}/edit`;
				break;
			}

			case "minute": {
				const minute = await db.createMinute({
					status: "draft",
					createdBy: userId,
				});
				redirectUrl = `/minutes/${minute.id}/edit`;
				break;
			}

			case "news": {
				const news = await db.createNews({
					title: "",
					content: "",
					createdBy: userId,
				});
				redirectUrl = `/news/${news.id}/edit`;
				break;
			}

			case "faq": {
				const faq = await db.createFaq({
					question: "",
					answer: "",
				});
				redirectUrl = `/faq/${faq.id}/edit`;
				break;
			}

			default:
				return { error: `Unknown entity type: ${type}` };
		}

		// Append source context and returnUrl as query params
		const params = new URLSearchParams();
		if (sourceType && sourceId) {
			params.append("source", `${sourceType}:${sourceId}${sourceName ? `:${encodeURIComponent(sourceName)}` : ''}`);
		}
		if (returnUrl) {
			params.append("returnUrl", returnUrl);
		}
		if (params.toString()) {
			redirectUrl += `?${params.toString()}`;
		}

		console.log(`[CreateDraft] Creating ${type} draft, redirecting to: ${redirectUrl}`);

		return redirect(redirectUrl);
	} catch (error) {
		console.error(`[CreateDraft] Failed to create ${type} draft:`, error);
		return { error: "Failed to create draft entity" };
	}
}
