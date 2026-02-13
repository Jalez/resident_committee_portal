import { getDatabase } from "~/db/server.server";
import { SITE_CONFIG } from "~/lib/config.server";

interface LoaderArgs {
	request: Request;
	params: { transactionId: string };
}

export async function loadTransactionEditData({ request, params }: LoaderArgs) {
	const db = getDatabase();

	const transactions = await db.getAllTransactions();
	const transaction = transactions.find((t) => t.id === params.transactionId);

	if (!transaction) {
		throw new Response("Not Found", { status: 404 });
	}

	// Note: Permission check should be done in the route file since it requires the request

	// Get linked purchase via entity relationships (if any)
	let purchase = null;
	const relationships = await db.getEntityRelationships(
		"transaction",
		transaction.id,
	);
	const purchaseRel = relationships.find(
		(r) =>
			r.relationBType === "reimbursement" ||
			r.relationAType === "reimbursement",
	);
	if (purchaseRel) {
		const purchaseId =
			purchaseRel.relationBType === "reimbursement"
				? purchaseRel.relationBId
				: purchaseRel.relationId;
		purchase = await db.getPurchaseById(purchaseId);
	}

	// Inventory items and picker items - simplified without legacy junction table
	// Use entity relationships to find linked inventory items
	const linkedItems: Array<{
		id: string;
		name: string;
		description: string | null;
		quantity: number;
		location: string | null;
		category: string | null;
		availableQuantity: number;
	}> = [];

	const inventoryRels = relationships.filter(
		(r) => r.relationBType === "inventory" || r.relationAType === "inventory",
	);
	for (const rel of inventoryRels) {
		const itemId =
			rel.relationBType === "inventory" ? rel.relationBId : rel.relationId;
		const item = await db.getInventoryItemById(itemId);
		if (item) {
			linkedItems.push({
				...item,
				availableQuantity: item.quantity,
			});
		}
	}

	const basePickerItems = await db.getInventoryItems();
	const linkedItemIds = new Set(linkedItems.map((item) => item.id));
	const pickerItems = [
		...linkedItems,
		...basePickerItems.filter((item) => !linkedItemIds.has(item.id)),
	];

	const allInventoryItems = await db.getInventoryItems();
	const uniqueLocations = [
		...new Set(allInventoryItems.map((item) => item.location).filter(Boolean)),
	].sort();
	const uniqueCategories = [
		...new Set(
			allInventoryItems
				.map((item) => item.category)
				.filter(Boolean) as string[],
		),
	].sort();

	// Get unlinked purchases - all purchases without a transaction relationship
	const allPurchases = await db.getPurchases();
	const unlinkedPurchases: typeof allPurchases = [];
	for (const p of allPurchases) {
		const prels = await db.getEntityRelationships("reimbursement", p.id);
		const hasTransaction = prels.some(
			(r) =>
				r.relationBType === "transaction" || r.relationAType === "transaction",
		);
		if (!hasTransaction) {
			unlinkedPurchases.push(p);
		}
	}
	// Add current linked purchase to the list if not already there
	if (purchase && !unlinkedPurchases.find((p) => p.id === purchase.id)) {
		unlinkedPurchases.unshift(purchase);
	}

	// Budget handling via entity relationships
	const budgetYear = transaction.year;
	const openBudgets = await db.getOpenFundBudgetsByYear(budgetYear);

	// Find linked budget via relationships
	const budgetRel = relationships.find(
		(r) => r.relationBType === "budget" || r.relationAType === "budget",
	);
	let budgetLink: { budget: (typeof openBudgets)[0]; amount: string } | null =
		null;
	if (budgetRel) {
		const budgetId =
			budgetRel.relationBType === "budget"
				? budgetRel.relationBId
				: budgetRel.relationId;
		const budget = await db.getFundBudgetById(budgetId);
		if (budget) {
			budgetLink = { budget, amount: "0" }; // Amount would need to be stored in relationship metadata
		}
	}

	const enrichedBudgets = [] as Array<{
		id: string;
		name: string;
		amount: string;
		status: string;
		year: number;
		createdBy: string | null;
		createdAt: Date;
		updatedAt: Date;
		description: string | null;
		usedAmount: number;
		remainingAmount: number;
	}>;
	for (const budget of openBudgets) {
		const usedAmount = await db.getBudgetUsedAmount(budget.id);
		const remainingAmount = Number.parseFloat(budget.amount) - usedAmount;
		enrichedBudgets.push({ ...budget, usedAmount, remainingAmount });
	}
	if (
		budgetLink &&
		!enrichedBudgets.find((b) => b.id === budgetLink?.budget.id)
	) {
		const usedAmount = await db.getBudgetUsedAmount(budgetLink.budget.id);
		const remainingAmount =
			Number.parseFloat(budgetLink.budget.amount) - usedAmount;
		enrichedBudgets.unshift({
			...budgetLink.budget,
			usedAmount,
			remainingAmount,
		});
	}

	const currentYear = new Date().getFullYear();

	return {
		siteConfig: SITE_CONFIG,
		transaction,
		purchase,
		linkedItems,
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		currentYear,
		unlinkedPurchases,
		openBudgets: enrichedBudgets,
		budgetLink,
	};
}
