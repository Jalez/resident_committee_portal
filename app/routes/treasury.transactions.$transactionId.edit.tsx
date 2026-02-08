import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Form,
	redirect,
	useActionData,
	useFetcher,
	useNavigate,
	useNavigation,
	useSearchParams,
} from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import {
	EXPENSE_CATEGORIES,
	INCOME_CATEGORIES,
	type TransactionType,
} from "~/components/treasury/transaction-details-form";

import { InventoryPicker } from "~/components/treasury/pickers/inventory-picker";
import { BudgetPicker } from "~/components/treasury/pickers/budget-picker";
import {
	TreasuryDetailCard,
	TreasuryField,
} from "~/components/treasury/treasury-detail-components";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { ReimbursementsPicker } from "~/components/treasury/pickers/reimbursements-picker";
import { useNewTransaction } from "~/contexts/new-transaction-context";
import {
	getDatabase,
} from "~/db";
import type {
	InventoryItem,
	NewInventoryItem,
	Purchase,
	ReimbursementStatus,
	Transaction,
	TransactionStatus,
} from "~/db/schema";
import {
	requirePermissionOrSelf,
	requireDeletePermissionOrSelf,
	type AuthenticatedUser,
} from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury.transactions.$transactionId.edit";

export function meta({ data }: Route.MetaArgs) {
	const description = data?.transaction?.description;
	const title = description
		? `Muokkaa: ${description.substring(0, 30)} / Edit Transaction`
		: "Muokkaa tapahtumaa / Edit Transaction";
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - ${title}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const db = getDatabase();

	const transactions = await db.getAllTransactions();
	const transaction = transactions.find((t) => t.id === params.transactionId);

	if (!transaction) {
		throw new Response("Not Found", { status: 404 });
	}

	await requirePermissionOrSelf(
		request,
		"treasury:transactions:update",
		"treasury:transactions:update-self",
		transaction.createdBy,
		getDatabase,
	);

	let purchase = null;
	if (transaction.purchaseId) {
		purchase = await db.getPurchaseById(transaction.purchaseId);
	}

	// Redirect if linked reimbursement has been sent (locked)
	if (purchase?.emailSent && purchase.status !== "rejected") {
		throw redirect(`/treasury/transactions/${params.transactionId}?editBlocked=1`);
	}

	const linkedItems = await db.getInventoryItemsForTransaction(
		params.transactionId,
	);

	const basePickerItems = await db.getInventoryItemsForPicker();
	const linkedItemIds = new Set(linkedItems.map((item) => item.id));
	const pickerItems = [
		...linkedItems.map((item) => ({
			...item,
			availableQuantity: item.quantity,
		})),
		...basePickerItems.filter((item) => !linkedItemIds.has(item.id)),
	];

	const allInventoryItems = await db.getInventoryItems();
	const uniqueLocations = [
		...new Set(
			allInventoryItems.map((item) => item.location).filter(Boolean),
		),
	].sort();
	const uniqueCategories = [
		...new Set(
			allInventoryItems
				.map((item) => item.category)
				.filter(Boolean) as string[],
		),
	].sort();

	const unlinkedPurchases = await db.getPurchasesWithoutTransactions();
	if (purchase && !unlinkedPurchases.find((p) => p.id === purchase.id)) {
		unlinkedPurchases.unshift(purchase);
	}

	const budgetYear = transaction.year;
	const openBudgets = await db.getOpenFundBudgetsByYear(budgetYear);
	const budgetLink = await db.getBudgetForTransaction(
		params.transactionId,
	);
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
		const remainingAmount =
			Number.parseFloat(budget.amount) - usedAmount;
		enrichedBudgets.push({ ...budget, usedAmount, remainingAmount });
	}
	if (
		budgetLink &&
		!enrichedBudgets.find((b) => b.id === budgetLink.budget.id)
	) {
		const usedAmount = await db.getBudgetUsedAmount(
			budgetLink.budget.id,
		);
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

export async function action({ request, params }: Route.ActionArgs) {
	const db = getDatabase();

	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	const transactions = await db.getAllTransactions();
	const transaction = transactions.find(
		(t) => t.id === params.transactionId,
	);
	const year = transaction?.year || new Date().getFullYear();

	let user: AuthenticatedUser;
	if (actionType === "delete") {
		user = await requireDeletePermissionOrSelf(
			request,
			"treasury:transactions:delete",
			"treasury:transactions:delete-self",
			transaction?.createdBy,
			getDatabase,
		);
	} else {
		user = await requirePermissionOrSelf(
			request,
			"treasury:transactions:update",
			"treasury:transactions:update-self",
			transaction?.createdBy,
			getDatabase,
		);
	}

	// Handle createItem action for InventoryPicker
	if (actionType === "createItem") {
		const name = formData.get("name") as string;
		const quantity =
			parseInt(formData.get("quantity") as string, 10) || 1;
		const location = formData.get("location") as string;
		const category = (formData.get("category") as string) || null;
		const description = (formData.get("description") as string) || null;
		const value = (formData.get("value") as string) || "0";

		const newItem: NewInventoryItem = {
			name,
			quantity,
			location,
			category,
			description,
			value,
			showInInfoReel: false,
		};

		const item = await db.createInventoryItem(newItem);
		return {
			success: true,
			item,
			message: "Inventory item created successfully",
		};
	}

	// Handle updateField action for inline editing inventory items
	if (actionType === "updateField") {
		const itemId = formData.get("itemId") as string;
		const field = formData.get("field") as string;
		const value = formData.get("value") as string;

		if (!itemId || !field) {
			return { success: false, error: "Missing itemId or field" };
		}

		const allowedFields = [
			"name",
			"quantity",
			"location",
			"category",
			"description",
			"value",
		];
		if (!allowedFields.includes(field)) {
			return { success: false, error: "Invalid field" };
		}

		let parsedValue: string | number = value;
		if (field === "quantity") {
			parsedValue = parseInt(value, 10) || 1;
		}

		await db.updateInventoryItem(itemId, { [field]: parsedValue });
		return { success: true };
	}

	// Handle delete action
	if (actionType === "delete") {
		if (!transaction) {
			return { error: "Transaction not found" };
		}

		try {
			const linkedItems =
				await db.getInventoryItemsForTransaction(
					params.transactionId,
				);
			for (const item of linkedItems) {
				await db.unlinkInventoryItemFromTransaction(
					item.id,
					params.transactionId,
				);
			}

			await db.deleteTransaction(params.transactionId);
			return redirect(
				`/treasury/transactions?year=${year}&success=transaction_deleted`,
			);
		} catch (error) {
			console.error("[deleteTransaction] Error:", error);
			return { error: "Failed to delete transaction" };
		}
	}



	// Guard: if actionType was set but not handled above
	if (actionType) {
		console.warn(`[Action] Unhandled action type: ${actionType}`);
		return {
			success: false,
			error: `Unhandled action type: ${actionType}`,
		};
	}

	// Handle update action (default)
	if (!transaction) {
		return { success: false, error: "Transaction not found" };
	}

	// Block edits if linked reimbursement has been sent
	if (transaction.purchaseId) {
		const linkedPurchase = await db.getPurchaseById(transaction.purchaseId);
		if (linkedPurchase?.emailSent && linkedPurchase.status !== "rejected") {
			return { success: false, error: "Cannot edit a transaction linked to a sent reimbursement" };
		}
	}

	const allowedStatuses: TransactionStatus[] = [
		"pending",
		"complete",
		"paused",
		"declined",
	];
	const allowedReimbursementStatuses: ReimbursementStatus[] = [
		"not_requested",
		"requested",
		"approved",
		"declined",
	];

	const status = (formData.get("status") as TransactionStatus) || transaction.status;
	const reimbursementStatus =
		(formData.get("reimbursementStatus") as ReimbursementStatus) ||
		transaction.reimbursementStatus ||
		"not_requested";

	if (!allowedStatuses.includes(status)) {
		return { success: false, error: "Invalid status" };
	}
	if (!allowedReimbursementStatuses.includes(reimbursementStatus)) {
		return { success: false, error: "Invalid reimbursement status" };
	}

	const description = formData.get("description") as string;
	const category = (formData.get("category") as string) || null;
	const amountStr = formData.get("amount") as string;
	const amount = amountStr
		? amountStr.replace(",", ".")
		: transaction.amount.toString();
	const budgetId = formData.get("budgetId") as string;
	const budgetAmount = formData.get("budgetAmount") as string;

	// Handle purchase linking
	const linkPurchaseId = formData.get("linkPurchaseId") as string;
	const newPurchaseId = linkPurchaseId || null;

	// Handle inventory items sync
	let computedAmount = amount;
	const inventoryItemsJson = formData.get("inventoryItems") as string;
	if (inventoryItemsJson) {
		const inventoryItems = JSON.parse(inventoryItemsJson) as { itemId: string; quantity: number }[];
		const linkedItems = await db.getInventoryItemsForTransaction(params.transactionId);
		const currentMap = new Map(linkedItems.map(i => [i.id, i]));
		const newMap = new Map(inventoryItems.map(i => [i.itemId, i]));

		// Links to remove
		for (const [id] of currentMap) {
			if (!newMap.has(id)) {
				await db.unlinkInventoryItemFromTransaction(id, params.transactionId);
			}
		}

		// Links to add or update
		for (const [id, item] of newMap) {
			await db.linkInventoryItemToTransaction(id, params.transactionId, item.quantity);
		}

		// Server-side: compute amount from inventory items when category is "inventory"
		if (category === "inventory" && inventoryItems.length > 0) {
			let total = 0;
			for (const item of inventoryItems) {
				const dbItem = await db.getInventoryItemById(item.itemId);
				if (dbItem) {
					total += parseFloat(dbItem.value || "0") * item.quantity;
				}
			}
			computedAmount = total.toFixed(2);
		}
	}

	await db.updateTransaction(params.transactionId, {
		status,
		reimbursementStatus,
		description,
		category,
		amount: computedAmount || "0",
		purchaseId: newPurchaseId,
	});

	// Update budget link if provided (expense-only)
	const currentBudgetLink = await db.getBudgetForTransaction(
		params.transactionId,
	);
	const shouldLinkBudget =
		transaction.type === "expense" && !!budgetId;
	const normalizedBudgetAmount = budgetAmount
		? budgetAmount.replace(",", ".")
		: amount || transaction.amount.toString();

	if (!shouldLinkBudget) {
		if (currentBudgetLink) {
			await db.unlinkTransactionFromBudget(
				params.transactionId,
				currentBudgetLink.budget.id,
			);
		}
	} else if (
		!currentBudgetLink ||
		currentBudgetLink.budget.id !== budgetId ||
		currentBudgetLink.amount !== normalizedBudgetAmount
	) {
		if (currentBudgetLink) {
			await db.unlinkTransactionFromBudget(
				params.transactionId,
				currentBudgetLink.budget.id,
			);
		}
		const budget = await db.getFundBudgetById(budgetId);
		if (budget) {
			await db.linkTransactionToBudget(
				params.transactionId,
				budgetId,
				normalizedBudgetAmount,
			);
		}
	}

	// If transaction has a linked purchase, update its status too
	if (newPurchaseId) {
		const purchaseStatus =
			reimbursementStatus === "approved"
				? "approved"
				: reimbursementStatus === "declined"
					? "rejected"
					: "pending";
		await db.updatePurchase(newPurchaseId, { status: purchaseStatus });
	}

	return redirect(`/treasury/breakdown?year=${year}`);
}

export default function EditTransaction({
	loaderData,
}: Route.ComponentProps) {
	const {
		transaction,
		purchase,
		linkedItems,
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		currentYear,
		unlinkedPurchases,
		openBudgets,
		budgetLink,
	} = loaderData as {
		transaction: Transaction;
		purchase: Purchase | null;
		linkedItems: (InventoryItem & { quantity: number })[];
		pickerItems: (InventoryItem & { availableQuantity: number })[];
		uniqueLocations: string[];
		uniqueCategories: string[];
		currentYear: number;
		unlinkedPurchases: Purchase[];
		openBudgets: Array<{
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
		budgetLink: {
			budget: { id: string };
			amount: string;
		} | null;
	};
	const navigate = useNavigate();
	const navigation = useNavigation();
	const fetcher = useFetcher();
	const isSubmitting =
		navigation.state === "submitting" ||
		fetcher.state === "submitting";

	interface ActionData {
		success?: boolean;
		message?: string;
		error?: string;
		linkedItemNames?: string;
	}

	const actionData = useActionData<ActionData>();
	const [searchParams, setSearchParams] = useSearchParams();
	const {
		items: contextItems,
		isHydrated,
		clearItems,
		setItems,
	} = useNewTransaction();
	const { t } = useTranslation();

	// Transaction form state
	const transactionType = transaction.type as TransactionType;
	const [amount, setAmount] = useState(String(transaction.amount));
	const [descriptionValue, setDescriptionValue] = useState(
		transaction.description,
	);
	const [category, setCategory] = useState(transaction.category || "");
	const [dateValue, setDateValue] = useState(
		new Date(transaction.date).toISOString().split("T")[0],
	);
	const [status, setStatus] = useState<TransactionStatus>(
		transaction.status,
	);
	const [reimbursementStatus, setReimbursementStatus] =
		useState<ReimbursementStatus>(
			transaction.reimbursementStatus || "not_requested",
		);

	// Purchase & budget linking state
	const [selectedPurchaseId, setSelectedPurchaseId] = useState(
		transaction.purchaseId || "",
	);
	const [selectedBudgetId, setSelectedBudgetId] = useState(
		budgetLink?.budget.id || "",
	);

	// Inventory state
	const [pendingItems, setPendingItems] = useState<
		{
			itemId: string;
			name: string;
			quantity: number;
			unitValue: number;
		}[]
	>(() =>
		linkedItems.map((item) => ({
			itemId: item.id,
			name: item.name,
			quantity: item.quantity,
			unitValue: parseFloat(item.value || "0"),
		})),
	);
	const initialLinkedIds = useRef<Set<string>>(
		new Set(linkedItems.map((i) => i.id)),
	);
	const hasProcessedAddItems = useRef(false);

	useEffect(() => {
		initialLinkedIds.current = new Set(
			linkedItems.map((i) => i.id),
		);
	}, [linkedItems]);

	// Build select options
	const categoryOptions = (
		transactionType === "income"
			? INCOME_CATEGORIES
			: EXPENSE_CATEGORIES
	).map((c) => ({
		value: c.value,
		label: t(`treasury.categories.${c.labelKey}`),
	}));

	const statusOptions = (
		["pending", "complete", "paused", "declined"] as const
	).map((s) => ({
		value: s,
		label: t(`treasury.breakdown.statuses.${s}`),
	}));

	const reimbursementStatusOptions = (
		[
			"not_requested",
			"requested",
			"approved",
			"declined",
		] as const
	).map((s) => ({
		value: s,
		label: t(`treasury.breakdown.edit.reimbursement_statuses.${s}`),
	}));

	// Load pending items from context when ?addItems=true
	useEffect(() => {
		const addItems = searchParams.get("addItems");
		if (!isHydrated) return;
		if (
			addItems === "true" &&
			contextItems.length > 0 &&
			!hasProcessedAddItems.current
		) {
			hasProcessedAddItems.current = true;
			setPendingItems((prev) => {
				const next = [...prev];
				const byId = new Map(next.map((p) => [p.itemId, p]));
				for (const c of contextItems) {
					const existing = byId.get(c.itemId);
					if (existing) {
						const idx = next.findIndex(
							(p) => p.itemId === c.itemId,
						);
						next[idx] = { ...existing, quantity: c.quantity };
					} else {
						next.push(c);
						byId.set(c.itemId, c);
					}
				}
				return next;
			});

			const contextIds = contextItems.map((c) => c.itemId);
			const quantities = Object.fromEntries(
				contextItems.map((c) => [c.itemId, c.quantity]),
			);
			fetcher.submit(
				{
					_action: "linkItems",
					itemIds: JSON.stringify(contextIds),
					quantities: JSON.stringify(quantities),
				},
				{ method: "POST" },
			);
			for (const id of contextIds) {
				initialLinkedIds.current.add(id);
			}

			clearItems();
			setSearchParams((prev) => {
				prev.delete("addItems");
				return prev;
			});
		}
	}, [
		searchParams,
		contextItems,
		isHydrated,
		clearItems,
		setSearchParams,
		fetcher,
	]);

	// Strict amount from inventory items — always override when items exist
	useEffect(() => {
		if (category === "inventory" && pendingItems.length > 0) {
			const totalValue = pendingItems.reduce(
				(sum, item) => sum + item.unitValue * item.quantity,
				0,
			);
			setAmount(totalValue.toFixed(2));
		}
	}, [pendingItems, category]);

	// Handle linking pending items (only link NEW items)
	const handleLinkPendingItems = () => {
		const newItemsToLink = pendingItems.filter(
			(item) => !initialLinkedIds.current.has(item.itemId),
		);

		if (newItemsToLink.length === 0) {
			toast.info(
				t("treasury.breakdown.edit.no_new_items_to_link"),
			);
			return;
		}

		for (const item of newItemsToLink) {
			fetcher.submit(
				{
					_action: "linkItems",
					itemIds: JSON.stringify([item.itemId]),
					quantities: JSON.stringify({
						[item.itemId]: item.quantity,
					}),
				},
				{ method: "POST" },
			);
			initialLinkedIds.current.add(item.itemId);
		}
		toast.success(
			t("treasury.breakdown.edit.items_linked_success"),
		);
	};

	const handleUnlinkItem = (itemId: string) => {
		fetcher.submit(
			{ _action: "unlinkItem", itemId },
			{ method: "POST" },
		);
	};

	const handleAddItem = async (itemData: {
		name: string;
		quantity: number;
		location: string;
		category?: string;
		description?: string;
		value?: string;
	}): Promise<InventoryItem | null> => {
		const formData = new FormData();
		formData.set("_action", "createItem");
		formData.set("name", itemData.name);
		formData.set("quantity", itemData.quantity.toString());
		formData.set("location", itemData.location);
		formData.set("category", itemData.category || "");
		formData.set("description", itemData.description || "");
		formData.set("value", itemData.value || "0");
		fetcher.submit(formData, { method: "POST" });
		return null;
	};



	// Toast on fetcher success/error
	useEffect(() => {
		if (fetcher.state !== "idle") return;
		if (!fetcher.data || typeof fetcher.data !== "object") return;

		const data = fetcher.data as {
			success?: boolean;
			error?: string;
			message?: string;
			redirectTo?: string;
		};

		if (data.error) {
			toast.error(data.error);
			return;
		}

		if (data.success) {
			toast.success(data.message || "Action completed");
			if (data.redirectTo) {
				navigate(data.redirectTo);
			}
		}
	}, [fetcher.state, fetcher.data, navigate]);

	useEffect(() => {
		if (actionData && "error" in actionData && actionData.error) {
			toast.error(
				typeof actionData.error === "string"
					? t(actionData.error, {
						names: actionData.linkedItemNames,
					})
					: "An error occurred",
			);
		}
	}, [actionData, t]);

	const deleteError =
		actionData?.error ===
			"treasury.breakdown.edit.delete_error_linked"
			? t(actionData.error, { names: actionData.linkedItemNames })
			: null;

	const formatCurrency = (value: string | number) => {
		const num =
			typeof value === "string" ? parseFloat(value) : value;
		return `${num.toFixed(2).replace(".", ",")} €`;
	};

	// If we have a linked budget, ensure we pass the enriched version (with remainingAmount)
	// which is guaranteed to be in openBudgets if the loader logic worked (it unshifts it).
	const linkedBudgetOption = budgetLink
		? openBudgets.find((b) => b.id === budgetLink.budget.id)
		: undefined;

	const currentPath = `/treasury/transactions/${transaction.id}/edit`;

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader
					title={t("treasury.breakdown.edit.title")}
				/>

				{deleteError && (
					<div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
						<div className="flex items-start gap-3">
							<span className="material-symbols-outlined text-red-600 dark:text-red-400">
								error
							</span>
							<div>
								<p className="font-medium text-red-800 dark:text-red-300">
									{t(
										"treasury.breakdown.edit.delete_blocked",
									)}
								</p>
								<p className="text-sm text-red-700 dark:text-red-400 mt-1">
									{deleteError}
								</p>
							</div>
						</div>
					</div>
				)}

				<Form method="post" className="space-y-6">
					<input
						type="hidden"
						name="type"
						value={transactionType}
					/>
					<input
						type="hidden"
						name="year"
						value={transaction.year}
					/>
					<input
						type="hidden"
						name="linkPurchaseId"
						value={selectedPurchaseId}
					/>

					<TreasuryDetailCard
						title={t("treasury.breakdown.edit.title")}
					>
						<div className="grid gap-4">
							<TreasuryField
								label={t("common.fields.type")}
							>
								{t(
									`treasury.types.${transactionType}`,
								)}
							</TreasuryField>
							<TreasuryField
								label={t("common.fields.year")}
							>
								{transaction.year}
							</TreasuryField>
							<TreasuryField
								mode="edit"
								label={`${t("common.fields.amount")} *`}
								name="amount"
								type="number"
								value={amount}
								onChange={setAmount}
								required
								step="0.01"
								min="0.01"
								disabled={category === "inventory" && pendingItems.length > 0}
							/>
							<TreasuryField
								mode="edit"
								label={`${t("common.fields.description")} *`}
								name="description"
								type="text"
								value={descriptionValue}
								onChange={setDescriptionValue}
								required
								placeholder={t(
									"treasury.form.description_placeholder",
								)}
							/>
							<TreasuryField
								mode="edit"
								label={`${t("treasury.breakdown.category", "Category")} *`}
								name="category"
								type="select"
								value={category}
								onChange={setCategory}
								options={categoryOptions}
								required
							/>
							<TreasuryField
								mode="edit"
								label={`${t("common.fields.date")} *`}
								name="date"
								type="date"
								value={dateValue}
								onChange={setDateValue}
								required
							/>

							<TreasuryField
								mode="edit"
								label={t(
									"treasury.breakdown.status",
								)}
								name="status"
								type="select"
								value={status}
								onChange={(v) =>
									setStatus(
										v as TransactionStatus,
									)
								}
								options={statusOptions}
							/>
						</div>

						{/* Inventory Items Section */}
						{category === "inventory" && (
							<div className="space-y-4">
								<input
									type="hidden"
									name="inventoryItems"
									value={JSON.stringify(
										pendingItems.map((i) => ({
											itemId: i.itemId,
											quantity: i.quantity,
										})),
									)}
								/>
								<InventoryPicker
									linkedItems={pendingItems}
									availableItems={pickerItems}
									onSelectionChange={(newItems) => {
										setPendingItems(newItems);
										setItems(newItems);
									}}
									storageKey={`transaction-${transaction.id}-inventory`}
									sourceEntityType="transaction"
									sourceEntityId={transaction.id}
									sourceEntityName={transaction.description || ""}
								/>
							</div>
						)}

						{/* Fund Budget Section - Only for expenses */}
						{transactionType === "expense" && (openBudgets.length > 0 || selectedBudgetId) && (
							<>
								<input type="hidden" name="budgetId" value={selectedBudgetId} />
								<input type="hidden" name="budgetAmount" value={amount} />
								<BudgetPicker
									linkedBudget={linkedBudgetOption}
									availableBudgets={openBudgets}
									selectedBudgetId={selectedBudgetId}
									onSelectionChange={setSelectedBudgetId}
									currentPath={currentPath}
									storageKey={`transaction-${transaction.id}-budget`}
									sourceEntityType="transaction"
									sourceEntityId={transaction.id}
									sourceEntityName={transaction.description || ""}
								/>
							</>
						)}

						{/* Reimbursement Linking Section - Only for expenses */}
						{/* Reimbursement Linking Section - Only for expenses */}
						{transactionType === "expense" && (
							<ReimbursementsPicker
								linkedReimbursement={purchase}
								unlinkedReimbursements={unlinkedPurchases}
								selectedReimbursementId={selectedPurchaseId}
								onSelectionChange={setSelectedPurchaseId}
								createUrl={`/treasury/reimbursements/new?linkTransactionId=${transaction.id}`}
								currentPath={undefined} // Not strictly needed if not used for back links in picker, but good practice if I had it. EditTransaction doesn't seem to have currentPath in loader/props? `useLocation`? uniqueLocations is something else.
								storageKey={`transaction-${transaction.id}-reimbursements`}
								sourceEntityType="transaction"
								sourceEntityId={transaction.id}
								sourceEntityName={transaction.description || ""}
							/>
						)}

					</TreasuryDetailCard>
					<TreasuryFormActions
						isSubmitting={isSubmitting}
						showDelete
						deleteTitle={t(
							"treasury.breakdown.edit.delete_title",
						)}
						deleteDescription={`${t("treasury.breakdown.edit.delete_confirm")}\n\n${transaction.description} (${formatCurrency(transaction.amount)})`}
					/>
				</Form>
			</div>
		</PageWrapper>
	);
}
