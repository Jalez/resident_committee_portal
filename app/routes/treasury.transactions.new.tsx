import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	Form,
	redirect,
	useActionData,
	useFetcher,
	useNavigate,
	useNavigation,
} from "react-router";
import { toast } from "sonner";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import {
	EXPENSE_CATEGORIES,
	INCOME_CATEGORIES,
	type TransactionType,
} from "~/components/treasury/transaction-details-form";
import { TransactionItemList } from "~/components/treasury/transaction-item-list";
import { BudgetPicker } from "~/components/treasury/pickers/budget-picker";
import { ReimbursementsPicker } from "~/components/treasury/pickers/reimbursements-picker";
import {
	TreasuryDetailCard,
	TreasuryField,
} from "~/components/treasury/treasury-detail-components";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { useNewTransaction } from "~/contexts/new-transaction-context";
import {
	type NewTransaction as DbNewTransaction,
	getDatabase,
	type InventoryItem,
	type NewInventoryItem,
	type Purchase,
} from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import type { Route } from "./+types/treasury.transactions.new";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Uusi tapahtuma / New Transaction`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(
		request,
		"treasury:transactions:write",
		getDatabase,
	);
	const db = getDatabase();

	// Parse URL params for pre-fill
	const url = new URL(request.url);

	const sourceReimbursementId = url.searchParams.get("sourceReimbursementId");
	const itemsParam = url.searchParams.get("items");
	let itemSelections: { itemId: string; quantity: number }[] = [];

	// Handle prefill from reimbursement
	let prefillData: {
		amount: string;
		description: string;
		type: "income" | "expense";
		category: string;
		linkPurchaseId: string;
		linkedInventoryItems: Array<{
			itemId: string;
			name: string;
			quantity: number;
			unitValue: number;
		}>;
	} | null = null;

	if (sourceReimbursementId) {
		try {
			const purchase = await db.getPurchaseById(sourceReimbursementId);
			if (purchase) {
				// Get linked receipts
				const receipts = await db.getReceiptsByPurchaseId(sourceReimbursementId);

				// Get inventory items from receipt processing
				const inventoryItemIds: string[] = [];
				for (const receipt of receipts) {
					const receiptContent = await db.getReceiptContentByReceiptId(receipt.id);
					if (receiptContent?.inventoryItemIds) {
						try {
							const ids = JSON.parse(receiptContent.inventoryItemIds);
							inventoryItemIds.push(...ids);
						} catch (error) {
							console.error("Error parsing inventory item IDs:", error);
						}
					}
				}

				const inventoryItemsResult = await Promise.all(
					inventoryItemIds.map(id => db.getInventoryItemById(id))
				);
				const validItems = inventoryItemsResult.filter((item): item is NonNullable<typeof item> => item !== null);

				prefillData = {
					amount: purchase.amount,
					description: purchase.description || "",
					type: "expense",
					category: validItems.length > 0 ? "inventory" : "other",
					linkPurchaseId: purchase.id,
					linkedInventoryItems: validItems.map(item => ({
						itemId: item.id,
						name: item.name,
						quantity: item.quantity,
						unitValue: parseFloat(item.value || "0"),
					})),
				};

				// Set item selections for later use
				itemSelections = validItems.map(item => ({
					itemId: item.id,
					quantity: item.quantity,
				}));
			}
		} catch (error) {
			console.error("Error loading source reimbursement:", error);
		}
	}

	if (itemsParam) {
		try {
			itemSelections = JSON.parse(itemsParam);
		} catch {
			const itemIds = itemsParam.split(",").filter(Boolean);
			itemSelections = itemIds.map((id) => ({
				itemId: id,
				quantity: 1,
			}));
		}
	}

	const prefillAmount = prefillData?.amount || url.searchParams.get("amount") || "";
	const prefillDescription = prefillData?.description || url.searchParams.get("description") || "";
	const prefillType = prefillData?.type || url.searchParams.get("type") as
		| "income"
		| "expense"
		| null;
	const prefillCategory =
		prefillData?.category ||
		url.searchParams.get("category") ||
		(itemSelections.length > 0 ? "inventory" : "");

	// If items provided, fetch their details with requested quantities
	const linkedItems: {
		id: string;
		name: string;
		quantity: number;
		requestedQuantity: number;
		value: string | null;
	}[] = [];
	if (itemSelections.length > 0) {
		for (const sel of itemSelections) {
			const item = await db.getInventoryItemById(sel.itemId);
			if (item) {
				linkedItems.push({
					id: item.id,
					name: item.name,
					quantity: item.quantity,
					requestedQuantity: sel.quantity,
					value: item.value,
				});
			}
		}
	}

	const pickerItems = await db.getInventoryItemsForPicker();

	const allInventoryItems = await db.getInventoryItems();
	const uniqueLocations = [
		...new Set(
			allInventoryItems.map((item) => item.location ?? "missing location"),
		),
	].sort();
	const uniqueCategories = [
		...new Set(
			allInventoryItems
				.map((item) => item.category)
				.filter(Boolean) as string[],
		),
	].sort();

	// Get purchases without linked transactions (for linking selector)
	const unlinkedPurchases =
		await db.getPurchasesWithoutTransactions();

	// Get open budgets for current year
	const currentYear = new Date().getFullYear();
	const openBudgets =
		await db.getOpenFundBudgetsByYear(currentYear);

	const enrichedBudgets = [];
	for (const budget of openBudgets) {
		const usedAmount = await db.getBudgetUsedAmount(budget.id);
		const remainingAmount =
			Number.parseFloat(budget.amount) - usedAmount;
		enrichedBudgets.push({
			...budget,
			usedAmount,
			remainingAmount,
		});
	}

	return {
		siteConfig: SITE_CONFIG,
		currentYear,
		prefill: {
			amount: prefillAmount,
			description: prefillDescription,
			type: prefillType || "expense",
			category: prefillCategory,
			itemIds: itemSelections.map((s) => s.itemId).join(","),
			linkPurchaseId: prefillData?.linkPurchaseId || "",
			date: "",
		},
		linkedItems,
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		unlinkedPurchases,
		openBudgets: enrichedBudgets,
		prefillData,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const user = await requirePermission(
		request,
		"treasury:transactions:write",
		getDatabase,
	);
	const db = getDatabase();

	const formData = await request.formData();
	const actionType = formData.get("_action");

	// Handle createItem action for InventoryPicker
	if (actionType === "createItem") {
		const name = formData.get("name") as string;
		const quantity =
			parseInt(formData.get("quantity") as string, 10) || 1;
		const location = formData.get("location") as string;
		const category = (formData.get("category") as string) || null;
		const description =
			(formData.get("description") as string) || null;
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
		const valueEntry = formData.get("value");
		if (
			!itemId ||
			!field ||
			!valueEntry ||
			typeof valueEntry !== "string"
		) {
			return {
				success: false,
				error: "Missing itemId, field, or value",
			};
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

		let parsedValue: string | number = valueEntry;
		if (field === "quantity") {
			parsedValue = parseInt(valueEntry, 10) || 1;
		}

		await db.updateInventoryItem(itemId, {
			[field]: parsedValue,
		});
		return { success: true };
	}

	// Guard: if actionType was set but not handled above
	if (actionType) {
		console.warn(`[Action] Unhandled action type: ${actionType}`);
		return {
			success: false,
			error: `Unhandled action type: ${actionType}`,
		};
	}

	// Default: create transaction
	const type = formData.get("type") as "income" | "expense";
	const amount = formData.get("amount") as string;
	const description = formData.get("description") as string;
	const category = (formData.get("category") as string) || null;
	const dateString = formData.get("date") as string;
	const year = parseInt(formData.get("year") as string, 10);
	const linkPurchaseId = formData.get("linkPurchaseId") as string;

	const purchaseId = linkPurchaseId || null;
	const status = purchaseId ? "pending" : "complete";
	const reimbursementStatus = purchaseId
		? "requested"
		: "not_requested";

	const newTransaction: DbNewTransaction = {
		type,
		amount,
		description,
		category,
		date: new Date(dateString),
		year,
		status,
		reimbursementStatus,
		purchaseId,
		createdBy: user.userId,
	};

	const transaction = await db.createTransaction(newTransaction);

	// Link inventory items to transaction if provided
	const linkedItemIds = formData.get("linkedItemIds") as string;
	if (linkedItemIds) {
		const ids = linkedItemIds.split(",").filter(Boolean);
		for (const itemId of ids) {
			const quantityField = formData.get(
				`itemQuantity_${itemId}`,
			) as string;
			const quantity = quantityField
				? parseInt(quantityField, 10)
				: null;

			if (quantity && quantity > 0) {
				await db.linkInventoryItemToTransaction(
					itemId,
					transaction.id,
					quantity,
				);
			} else {
				const item = await db.getInventoryItemById(itemId);
				if (item) {
					await db.linkInventoryItemToTransaction(
						itemId,
						transaction.id,
						item.quantity,
					);
				}
			}
		}
	}

	// Link to budget if provided (for expenses from reserved funds)
	const budgetId = formData.get("budgetId") as string;
	const budgetAmount = formData.get("budgetAmount") as string;
	if (budgetId && type === "expense") {
		const budget = await db.getFundBudgetById(budgetId);
		if (budget) {
			const linkAmount = budgetAmount
				? budgetAmount.replace(",", ".")
				: amount.replace(",", ".");
			await db.linkTransactionToBudget(
				transaction.id,
				budgetId,
				linkAmount,
			);
		}
	}

	return redirect(
		`/treasury?year=${year}&success=transaction_created`,
	);
}

export default function NewTransaction({
	loaderData,
}: Route.ComponentProps) {
	const {
		currentYear,
		prefill,
		linkedItems,
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		unlinkedPurchases,
		openBudgets,
		prefillData,
	} = loaderData ?? {
		currentYear: new Date().getFullYear(),
		prefill: {
			amount: "",
			description: "",
			type: "expense" as const,
			category: "",
			itemIds: "",
			linkPurchaseId: "",
			date: "",
		},
		linkedItems: [] as Array<{
			id: string;
			name: string;
			quantity: number;
			value: string | null;
		}>,
		pickerItems: [] as (InventoryItem & {
			availableQuantity: number;
		})[],
		uniqueLocations: [] as string[],
		uniqueCategories: [] as string[],
		unlinkedPurchases: [] as Purchase[],
		openBudgets: [] as Array<{
			id: string;
			name: string;
			description: string | null;
			amount: string;
			year: number;
			remainingAmount: number;
		}>,
	};
	const navigate = useNavigate();
	const fetcher = useFetcher();
	const actionData = useActionData<typeof action>();
	const navigation = useNavigation();
	const isSubmitting =
		navigation.state === "submitting" ||
		fetcher.state === "submitting";
	const normalizedLocations = uniqueLocations.map(
		(location) => location ?? "missing location",
	);

	const { items: contextItems, setItems } = useNewTransaction();
	const { t } = useTranslation();

	const [selectedPurchaseId, setSelectedPurchaseId] = useState("");
	const [selectedBudgetId, setSelectedBudgetId] = useState("");
	const [transactionType, setTransactionType] = useState<TransactionType>(
		prefill.type,
	);
	const [amount, setAmount] = useState(prefill.amount || "");
	const [descriptionValue, setDescriptionValue] = useState(
		prefill.description || "",
	);
	const [dateValue, setDateValue] = useState(
		prefill.date || new Date().toISOString().split("T")[0],
	);
	const [selectedCategory, setSelectedCategory] = useState(
		prefill.category ||
		(contextItems.length > 0 ? "inventory" : ""),
	);
	const [year, setYear] = useState(currentYear);
	const [selectedItemIds, setSelectedItemIds] = useState<string[]>(
		contextItems.length > 0
			? contextItems.map((i) => i.itemId)
			: prefill.itemIds
				? prefill.itemIds.split(",").filter(Boolean)
				: [],
	);

	// Update form values when a purchase is selected for linking
	useEffect(() => {
		if (selectedPurchaseId) {
			const purchase = unlinkedPurchases.find(
				(p) => p.id === selectedPurchaseId,
			);
			if (purchase) {
				setAmount(purchase.amount);
				setDescriptionValue(purchase.description || "");
				setDateValue(
					new Date(purchase.createdAt)
						.toISOString()
						.split("T")[0],
				);
			}
		}
	}, [selectedPurchaseId, unlinkedPurchases]);

	useEffect(() => {
		if (actionData && "error" in actionData && actionData.error) {
			toast.error(
				typeof actionData.error === "string"
					? actionData.error
					: "Failed to create transaction",
			);
		}
		if (
			fetcher.data &&
			"success" in fetcher.data &&
			fetcher.data.success
		) {
			toast.success("Inventory item created");
		}
	}, [actionData, fetcher.data]);

	// Strict amount from inventory items — always override when items exist
	useEffect(() => {
		if (selectedCategory === "inventory" && contextItems.length > 0) {
			const total = contextItems.reduce(
				(sum, item) =>
					sum + item.quantity * item.unitValue,
				0,
			);
			setAmount(total.toFixed(2));
		}
	}, [contextItems, selectedCategory]);

	// Pre-fill from reimbursement
	useEffect(() => {
		if (prefillData) {
			setAmount(prefillData.amount);
			setDescriptionValue(prefillData.description);
			setTransactionType(prefillData.type);
			setSelectedCategory(prefillData.category);
			setSelectedPurchaseId(prefillData.linkPurchaseId);

			// Pre-fill inventory items
			if (prefillData.linkedInventoryItems && prefillData.linkedInventoryItems.length > 0) {
				setItems(prefillData.linkedInventoryItems);
				setSelectedItemIds(prefillData.linkedInventoryItems.map(i => i.itemId));
			}
		}
	}, [prefillData, setItems]);

	// Build options
	const categoryOptions = (
		transactionType === "income"
			? INCOME_CATEGORIES
			: EXPENSE_CATEGORIES
	).map((c) => ({
		value: c.value,
		label: t(`treasury.categories.${c.labelKey}`),
	}));

	const typeOptions = [
		{
			value: "expense",
			label: t("treasury.types.expense"),
		},
		{
			value: "income",
			label: t("treasury.types.income"),
		},
	];

	const yearOptions = Array.from(
		{ length: 5 },
		(_, i) => currentYear - i,
	).map((y) => ({
		value: y.toString(),
		label: y.toString(),
	}));

	// Combined items map for picker
	const availableItemsMap = new Map<
		string,
		InventoryItem & { availableQuantity?: number }
	>();

	for (const item of pickerItems) {
		availableItemsMap.set(item.id, item);
	}

	for (const li of linkedItems) {
		if (!availableItemsMap.has(li.id)) {
			availableItemsMap.set(li.id, {
				...li,
				location: "",
				category: null,
				description: null,
				showInInfoReel: false,
				purchasedAt: null,
				createdAt: new Date(),
				updatedAt: new Date(),
				status: "active",
				removedAt: null,
				removalReason: null,
				removalNotes: null,
				needsCompletion: false,
				completionNotes: null,
				manualCount: 0,
				availableQuantity: li.quantity,
			} as InventoryItem & { availableQuantity: number });
		}
	}

	const availableItems = Array.from(availableItemsMap.values());

	// Handler for adding new inventory item from picker
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

	const handleInlineEdit = (
		itemId: string,
		field: string,
		value: string,
	) => {
		const formData = new FormData();
		formData.set("_action", "updateField");
		formData.set("itemId", itemId);
		formData.set("field", field);
		formData.set("value", value);
		fetcher.submit(formData, { method: "POST" });
	};

	const currentPath = "/treasury/transactions/new";

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-8">
				<PageHeader title={t("treasury.new.header")} />

				<Form method="post" className="space-y-6">
					{/* Hidden fields for form submission */}
					<input
						type="hidden"
						name="linkedItemIds"
						value={selectedItemIds.join(",")}
					/>
					<input
						type="hidden"
						name="linkPurchaseId"
						value={selectedPurchaseId}
					/>

					<TreasuryDetailCard
						title={t("treasury.new.details_header")}
					>
						<div className="grid gap-4">
							<TreasuryField
								mode="edit"
								label={`${t("common.fields.type")} *`}
								name="type"
								type="select"
								value={transactionType}
								onChange={(v) =>
									setTransactionType(
										v as TransactionType,
									)
								}
								options={typeOptions}
								required
							/>
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
								disabled={selectedCategory === "inventory" && contextItems.length > 0}
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
								value={selectedCategory}
								onChange={setSelectedCategory}
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
								label={`${t("common.fields.year")} *`}
								name="year"
								type="select"
								value={year.toString()}
								onChange={(v) =>
									setYear(parseInt(v, 10))
								}
								options={yearOptions}
								required
							/>
						</div>

					{/* Inventory Selection Section */}
					{selectedCategory === "inventory" && (
						<div className="space-y-4">
							<TransactionItemList
								items={contextItems}
								onItemsChange={(newItems) => {
									setItems(newItems);
									setSelectedItemIds(
										newItems.map(
											(i) => i.itemId,
										),
									);
								}}
								availableItems={availableItems}
								uniqueLocations={normalizedLocations}
								uniqueCategories={uniqueCategories}
								onAddNewItem={handleAddItem}
								onInlineEdit={handleInlineEdit}
								title={t(
									"treasury.new.inventory_title",
								)}
								description={t(
									"treasury.new.inventory_desc",
								)}
								emptyMessage={t(
									"treasury.new.inventory_empty",
								)}
								hideSelectedList={true}
							/>

							{/* Hidden inputs for form submission */}
							{contextItems.map((ctxItem) => (
								<input
									key={`qty-${ctxItem.itemId}`}
									type="hidden"
									name={`itemQuantity_${ctxItem.itemId}`}
									value={ctxItem.quantity}
								/>
							))}
						</div>
					)}

					{/* Fund Budget Section - Only for expenses */}
					{transactionType === "expense" && (openBudgets.length > 0 || selectedBudgetId) && (
						<>
							<input type="hidden" name="budgetId" value={selectedBudgetId} />
							<input type="hidden" name="budgetAmount" value={amount} />
							<BudgetPicker
								availableBudgets={openBudgets}
								selectedBudgetId={selectedBudgetId}
								onSelectionChange={setSelectedBudgetId}
								currentPath={currentPath}
								storageKey="transaction-new-budget"
							/>
						</>
					)}

					{/* Reimbursement Linking Section - Only for expenses */}
					{transactionType === "expense" && (
						<ReimbursementsPicker
							linkedReimbursement={
								selectedPurchaseId
									? unlinkedPurchases.find(
											(p) => p.id === selectedPurchaseId,
										)
									: null
							}
							unlinkedReimbursements={unlinkedPurchases}
							selectedReimbursementId={selectedPurchaseId}
							onSelectionChange={setSelectedPurchaseId}
							createUrl="/treasury/reimbursements/new"
							currentPath={currentPath}
							storageKey="transaction-new-reimbursements"
						/>
					)}

</TreasuryDetailCard>
					<TreasuryFormActions
						isSubmitting={isSubmitting}
						saveLabel={t("treasury.new.submit")}
					/>

				</Form>
			</div>
		</PageWrapper>
	);
}
