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
import { ReimbursementForm } from "~/components/treasury/reimbursement-form";
import { TransactionItemList } from "~/components/treasury/transaction-item-list";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { useNewTransaction } from "~/contexts/new-transaction-context";
import {
	type NewTransaction as DbNewTransaction,
	getDatabase,
	type InventoryItem,
	type NewInventoryItem,
	type NewPurchase,
} from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { clearCache } from "~/lib/cache.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { RECEIPT_MAX_SIZE_BYTES } from "~/lib/constants";
import { isEmailConfigured, sendReimbursementEmail } from "~/lib/email.server";
import {
	getMinutesByYear,
	getOrCreateReceiptsFolder,
	getReceiptsByYear,
	uploadReceiptToDrive,
} from "~/lib/google.server";
import type { Route } from "./+types/treasury.new";

// Category options for transactions with keys
const EXPENSE_CATEGORIES = [
	{ value: "inventory", labelKey: "inventory" },
	{ value: "snacks", labelKey: "snacks" },
	{ value: "supplies", labelKey: "supplies" },
	{ value: "event", labelKey: "event" },
	{ value: "other", labelKey: "other" },
] as const;

const INCOME_CATEGORIES = [
	{ value: "grant", labelKey: "grant" },
	{ value: "sales", labelKey: "sales" },
	{ value: "event_income", labelKey: "event_income" },
	{ value: "membership", labelKey: "membership" },
	{ value: "other", labelKey: "other" },
] as const;

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Uusi tapahtuma / New Transaction`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "treasury:write", getDatabase);
	const db = getDatabase();

	// Parse URL params for pre-fill
	const url = new URL(request.url);

	// Items can be passed as JSON array [{itemId, quantity}] or comma-separated IDs (legacy)
	const itemsParam = url.searchParams.get("items");
	let itemSelections: { itemId: string; quantity: number }[] = [];

	if (itemsParam) {
		try {
			// Try parsing as JSON first (new format from QuantitySelectionModal)
			itemSelections = JSON.parse(itemsParam);
		} catch {
			// Fallback to comma-separated IDs (legacy format)
			const itemIds = itemsParam.split(",").filter(Boolean);
			itemSelections = itemIds.map((id) => ({ itemId: id, quantity: 1 }));
		}
	}

	const prefillAmount = url.searchParams.get("amount") || "";
	const prefillDescription = url.searchParams.get("description") || "";
	const prefillType = url.searchParams.get("type") as
		| "income"
		| "expense"
		| null;
	const prefillCategory =
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
					requestedQuantity: sel.quantity, // The quantity user wants to link
					value: item.value,
				});
			}
		}
	}

	// Get inventory items available for picker (active, non-legacy, with available quantity)
	const pickerItems = await db.getInventoryItemsForPicker();

	// Get unique locations and categories for picker filters
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

	// Get recent minutes for dropdown
	const minutesByYear = await getMinutesByYear();
	const recentMinutes = minutesByYear
		.flatMap((year) =>
			year.files.map((file) => ({
				id: file.id,
				name: file.name,
				url: file.url,
				year: year.year,
			})),
		)
		.slice(0, 20);

	// Get receipts for picker
	const receiptsByYear = await getReceiptsByYear();
	const currentYearReceipts = receiptsByYear.find(
		(r) => r.year === new Date().getFullYear().toString(),
	);

	return {
		siteConfig: SITE_CONFIG,
		currentYear: new Date().getFullYear(),
		recentMinutes,
		emailConfigured: isEmailConfigured(),
		// Pre-fill data
		prefill: {
			amount: prefillAmount,
			description: prefillDescription,
			type: prefillType || "expense",
			category: prefillCategory,
			itemIds: itemSelections.map((s) => s.itemId).join(","),
		},
		linkedItems,
		// Inventory picker data - now includes availableQuantity
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		// Receipt picker data
		receiptsByYear,
		receiptsFolderUrl: currentYearReceipts?.folderUrl || "#",
	};
}

export async function action({ request }: Route.ActionArgs) {
	await requirePermission(request, "treasury:write", getDatabase);
	const db = getDatabase();

	const formData = await request.formData();
	const actionType = formData.get("_action");

	// Handle createItem action for InventoryPicker
	if (actionType === "createItem") {
		const name = formData.get("name") as string;
		const quantity = parseInt(formData.get("quantity") as string, 10) || 1;
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

	// Handle uploadReceipt action for ReceiptPicker
	if (actionType === "uploadReceipt") {
		const receiptFile = formData.get("receiptFile") as File;
		const year = formData.get("year") as string;
		const description = formData.get("description") as string;

		if (!receiptFile || receiptFile.size === 0) {
			return { success: false, error: "No file provided" };
		}

		// Validate file size
		if (receiptFile.size > RECEIPT_MAX_SIZE_BYTES) {
			return { success: false, error: "File too large" };
		}

		try {
			const arrayBuffer = await receiptFile.arrayBuffer();
			const base64Content = Buffer.from(arrayBuffer).toString("base64");

			const result = await uploadReceiptToDrive(
				{
					name: receiptFile.name,
					content: base64Content,
					mimeType: receiptFile.type,
				},
				year,
				description,
			);

			if (result) {
				return { success: true, receipt: result };
			} else {
				return { success: false, error: "Upload failed" };
			}
		} catch (error) {
			console.error("[uploadReceipt] Error:", error);
			return { success: false, error: "Upload failed" };
		}
	}

	// Handle ensureReceiptsFolder action for ReimbursementForm
	if (actionType === "ensureReceiptsFolder") {
		const year = formData.get("year") as string;
		try {
			const result = await getOrCreateReceiptsFolder(year);
			if (result) {
				return { success: true, folderUrl: result.folderUrl };
			}
			return { success: false, error: "Could not create receipts folder" };
		} catch (error) {
			console.error("[ensureReceiptsFolder] Error:", error);
			return { success: false, error: "Failed to create receipts folder" };
		}
	}

	// Handle refreshReceipts action to clear cache
	if (actionType === "refreshReceipts") {
		clearCache("RECEIPTS_BY_YEAR");
		return { success: true };
	}

	const type = formData.get("type") as "income" | "expense";
	const amount = formData.get("amount") as string;
	const description = formData.get("description") as string;
	const category = (formData.get("category") as string) || null;
	const dateString = formData.get("date") as string;
	const year = parseInt(formData.get("year") as string, 10);
	const requestReimbursement = formData.get("requestReimbursement") === "on";

	// Determine status based on reimbursement request
	const status = requestReimbursement ? "pending" : "complete";
	const reimbursementStatus = requestReimbursement
		? "requested"
		: "not_requested";

	// Create purchase record if reimbursement requested
	let purchaseId: string | null = null;

	if (requestReimbursement) {
		const purchaserName = formData.get("purchaserName") as string;
		const bankAccount = formData.get("bankAccount") as string;
		const minutesId = formData.get("minutesId") as string;
		const minutesName = formData.get("minutesName") as string;
		let minutesUrl = formData.get("minutesUrl") as string;

		// Ensure we have a valid URL for the minutes
		if (!minutesUrl && minutesId) {
			minutesUrl = `https://drive.google.com/file/d/${minutesId}/view`;
		}

		const notes = formData.get("notes") as string;

		// Parse receipt links from the form (JSON string from ReceiptPicker)
		const receiptLinksJson = formData.get("receiptLinks") as string;
		let receiptLinks: { id: string; name: string; url: string }[] = [];
		try {
			receiptLinks = receiptLinksJson ? JSON.parse(receiptLinksJson) : [];
		} catch {
			receiptLinks = [];
		}

		const newPurchase: NewPurchase = {
			description,
			amount,
			purchaserName,
			bankAccount,
			minutesId,
			minutesName: minutesName || null,
			notes: notes || null,
			status: "pending",
			year,
			emailSent: false,
		};

		const purchase = await db.createPurchase(newPurchase);
		purchaseId = purchase.id;

		// Send email with receipt links (fire-and-forget to avoid timeout on Vercel Hobby plan)
		sendReimbursementEmail(
			{
				itemName: description,
				itemValue: amount,
				purchaserName,
				bankAccount,
				minutesReference:
					minutesName || minutesId || "Ei määritetty / Not specified",
				minutesUrl,
				notes,
				receiptLinks: receiptLinks.length > 0 ? receiptLinks : undefined,
			},
			purchase.id,
		)
			.then(async (emailResult) => {
				if (emailResult.success) {
					await db.updatePurchase(purchase.id, {
						emailSent: true,
						emailMessageId: emailResult.messageId,
					});
				} else {
					await db.updatePurchase(purchase.id, {
						emailError: emailResult.error || "Unknown email error",
					});
				}
			})
			.catch(async (error) => {
				await db.updatePurchase(purchase.id, {
					emailError: error instanceof Error ? error.message : "Unknown error",
				});
			});
	}

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
	};

	const transaction = await db.createTransaction(newTransaction);

	// Link inventory items to transaction if provided
	const linkedItemIds = formData.get("linkedItemIds") as string;
	if (linkedItemIds) {
		const ids = linkedItemIds.split(",").filter(Boolean);
		for (const itemId of ids) {
			// Get quantity from the hidden form field (set by context items)
			const quantityField = formData.get(`itemQuantity_${itemId}`) as string;
			const quantity = quantityField ? parseInt(quantityField, 10) : null;

			if (quantity && quantity > 0) {
				// Use the specified quantity
				await db.linkInventoryItemToTransaction(
					itemId,
					transaction.id,
					quantity,
				);
			} else {
				// Fallback: get from item (legacy behavior for picker-selected items)
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

	return redirect(`/treasury?year=${year}&success=Transaction created`);
}

export default function NewTransaction({ loaderData }: Route.ComponentProps) {
	const {
		currentYear,
		recentMinutes,
		emailConfigured,
		prefill,
		linkedItems,
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		receiptsByYear,
		receiptsFolderUrl,
	} = loaderData ?? {
		currentYear: new Date().getFullYear(),
		recentMinutes: [] as Array<{
			id: string;
			name: string;
			url?: string;
			year: number;
		}>,
		emailConfigured: false,
		prefill: {
			amount: "",
			description: "",
			type: "expense" as const,
			category: "",
			itemIds: "",
		},
		linkedItems: [] as Array<{
			id: string;
			name: string;
			quantity: number;
			value: string | null;
		}>,
		pickerItems: [] as (InventoryItem & { availableQuantity: number })[],
		uniqueLocations: [] as string[],
		uniqueCategories: [] as string[],
		receiptsByYear: [] as Array<{
			year: string;
			files: Array<{
				id: string;
				name: string;
				url: string;
				createdTime: string;
			}>;
			folderUrl: string;
			folderId: string;
		}>,
		receiptsFolderUrl: "#",
	};
	const navigate = useNavigate();
	const fetcher = useFetcher();
	const actionData = useActionData<typeof action>();
	const navigation = useNavigation();
	const isSubmitting =
		navigation.state === "submitting" || fetcher.state === "submitting";

	// Get items from context (set by inventory page)
	const { items: contextItems, setItems } = useNewTransaction();
	const { t } = useTranslation();

	const [requestReimbursement, setRequestReimbursement] = useState(false);
	const [transactionType, setTransactionType] = useState<"income" | "expense">(
		prefill.type,
	);
	const [amount, setAmount] = useState(prefill.amount || "");
	const [descriptionValue, setDescriptionValue] = useState(
		prefill.description || "",
	);

	useEffect(() => {
		if (actionData && "error" in actionData && actionData.error) {
			toast.error(
				typeof actionData.error === "string"
					? actionData.error
					: "Failed to create transaction",
			);
		}

		// Handle fetcher success (inventory item creation)
		if (fetcher.data && "success" in fetcher.data && fetcher.data.success) {
			toast.success("Inventory item created");
		}
	}, [actionData, fetcher.data]);

	// State for category and selected inventory items
	const [selectedCategory, setSelectedCategory] = useState(
		prefill.category || (contextItems.length > 0 ? "inventory" : ""),
	);

	// Update category options based on type
	const categoryOptions =
		transactionType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

	// Use context items for the transaction
	// selectedItemIds track which items are selected (for form submission)
	const [selectedItemIds, setSelectedItemIds] = useState<string[]>(
		contextItems.length > 0
			? contextItems.map((i) => i.itemId)
			: prefill.itemIds
				? prefill.itemIds.split(",").filter(Boolean)
				: [],
	);

	// Sync amount with inventory items total when quantities change
	useEffect(() => {
		if (contextItems.length > 0 && !prefill.amount) {
			const total = contextItems.reduce(
				(sum, item) => sum + item.quantity * item.unitValue,
				0,
			);
			if (total > 0) {
				setAmount(total.toFixed(2));
			}
		}
	}, [contextItems, prefill.amount]);

	// Combined items: picker items + any pre-selected linked items (for editing)
	// pickerItems now has availableQuantity which shows how many can still be linked
	const availableItemsMap = new Map<
		string,
		InventoryItem & { availableQuantity?: number }
	>();

	// Add picker items first (these have full data including availableQuantity)
	for (const item of pickerItems) {
		availableItemsMap.set(item.id, item);
	}

	// Only add linked items if they're NOT already in the map
	// (linked items have sparse data, so we prefer picker ones)
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
				manualCount: 0,
				availableQuantity: li.quantity,
			} as InventoryItem & { availableQuantity: number });
		}
	}

	const availableItems = Array.from(availableItemsMap.values());

	// Generate year options (last 5 years)
	const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

	// Calculate total from selected items using context quantities
	const _selectedItemsTotal =
		contextItems.length > 0
			? contextItems.reduce(
					(sum, ctxItem) => sum + ctxItem.quantity * ctxItem.unitValue,
					0,
				)
			: selectedItemIds.reduce((sum, id) => {
					const item = availableItems.find((i) => i.id === id);
					if (item?.value) {
						return sum + parseFloat(item.value) * (item.quantity || 1);
					}
					return sum;
				}, 0);

	// Handler for adding new inventory item from picker
	const handleAddItem = async (itemData: {
		name: string;
		quantity: number;
		location: string;
		category?: string;
		description?: string;
		value?: string;
	}): Promise<InventoryItem | null> => {
		// Use fetcher to create the item
		const formData = new FormData();
		formData.set("_action", "createItem");
		formData.set("name", itemData.name);
		formData.set("quantity", itemData.quantity.toString());
		formData.set("location", itemData.location);
		formData.set("category", itemData.category || "");
		formData.set("description", itemData.description || "");
		formData.set("value", itemData.value || "0");

		// For now, return null and let the component refresh
		// The fetcher will trigger a reload
		fetcher.submit(formData, { method: "POST" });
		return null;
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4">
				<div className="mb-8">
					<h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">
						{t("treasury.new.header")}
					</h1>
				</div>

				<Form method="post" encType="multipart/form-data" className="space-y-6">
					{/* Hidden field for selected item IDs */}
					<input
						type="hidden"
						name="linkedItemIds"
						value={selectedItemIds.join(",")}
					/>

					{/* Transaction Details */}
					<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
						<h2 className="text-lg font-bold text-gray-900 dark:text-white">
							{t("treasury.new.details_header")}
						</h2>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="type">{t("treasury.form.type")} *</Label>
								<Select
									name="type"
									defaultValue={prefill.type}
									value={transactionType}
									onValueChange={(val: "income" | "expense") =>
										setTransactionType(val)
									}
									required
								>
									<SelectTrigger>
										<SelectValue
											placeholder={t("treasury.placeholders.select_type")}
										/>
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="income">
											<span className="flex items-center gap-2">
												<span className="text-green-600">+</span>
												{t("treasury.types.income")}
											</span>
										</SelectItem>
										<SelectItem value="expense">
											<span className="flex items-center gap-2">
												<span className="text-red-600">-</span>
												{t("treasury.types.expense")}
											</span>
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="amount">{t("treasury.form.amount")} *</Label>
								<Input
									id="amount"
									name="amount"
									type="number"
									step="0.01"
									min="0.01"
									required
									placeholder="0.00"
									value={amount}
									onChange={(e) => setAmount(e.target.value)}
								/>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">
								{t("treasury.form.description")} *
							</Label>
							<Input
								id="description"
								name="description"
								required
								placeholder={t("treasury.form.description_placeholder")}
								value={descriptionValue}
								onChange={(e) => setDescriptionValue(e.target.value)}
							/>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="category">
									{t("treasury.form.category")} *
								</Label>
								<Select
									name="category"
									value={selectedCategory}
									onValueChange={setSelectedCategory}
									required
								>
									<SelectTrigger>
										<SelectValue
											placeholder={t("treasury.placeholders.select_category")}
										/>
									</SelectTrigger>
									<SelectContent>
										{categoryOptions.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{t(`treasury.categories.${opt.labelKey}`)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="date">{t("treasury.form.date")} *</Label>
								<Input
									id="date"
									name="date"
									type="date"
									required
									defaultValue={new Date().toISOString().split("T")[0]}
								/>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="year">{t("treasury.form.year")} *</Label>
							<Select
								name="year"
								defaultValue={currentYear.toString()}
								required
							>
								<SelectTrigger>
									<SelectValue
										placeholder={t("treasury.placeholders.select_year")}
									/>
								</SelectTrigger>
								<SelectContent>
									{yearOptions.map((year) => (
										<SelectItem key={year} value={year.toString()}>
											{year}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Inventory Selection Section - shown when category is "inventory" */}
					{selectedCategory === "inventory" && (
						<div className="space-y-4">
							<TransactionItemList
								items={contextItems}
								onItemsChange={(newItems) => {
									setItems(newItems);
									// Sync selected IDs just in case other logic depends on it
									setSelectedItemIds(newItems.map((i) => i.itemId));
								}}
								availableItems={availableItems}
								uniqueLocations={uniqueLocations}
								uniqueCategories={uniqueCategories}
								onAddNewItem={handleAddItem}
								description={t("treasury.new.inventory_desc")}
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

					{/* Reimbursement Section - Only for expenses */}
					{transactionType === "expense" && (
						<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
							<div className="flex items-center gap-3">
								<Checkbox
									id="requestReimbursement"
									name="requestReimbursement"
									checked={requestReimbursement}
									onCheckedChange={(checked) =>
										setRequestReimbursement(checked === true)
									}
								/>
								<Label
									htmlFor="requestReimbursement"
									className="text-lg font-bold cursor-pointer"
								>
									{t("treasury.new.request_reimbursement")}
								</Label>
							</div>

							<p className="text-sm text-gray-500 dark:text-gray-400">
								{t("treasury.new.reimbursement_help")}
							</p>

							{requestReimbursement && (
								<div className="pt-4 border-t border-gray-200 dark:border-gray-700">
									<ReimbursementForm
										recentMinutes={recentMinutes.map((m) => ({
											...m,
											year: m.year.toString(),
										}))}
										emailConfigured={emailConfigured}
										receiptsByYear={receiptsByYear}
										currentYear={currentYear}
										receiptsFolderUrl={receiptsFolderUrl}
										description={descriptionValue}
										showNotes={true}
										required={requestReimbursement}
									/>
								</div>
							)}
						</div>
					)}

					<div className="flex gap-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate(-1)}
							className="flex-1"
						>
							{t("settings.common.cancel")}
						</Button>
						<Button type="submit" className="flex-1" disabled={isSubmitting}>
							{isSubmitting ? (
								<span className="flex items-center gap-2">
									<span className="animate-spin material-symbols-outlined text-sm">
										progress_activity
									</span>
									<span>{t("settings.common.saving")}</span>
								</span>
							) : requestReimbursement ? (
								t("treasury.new.submit_and_request")
							) : (
								t("treasury.new.submit")
							)}
						</Button>
					</div>
				</Form>
			</div>
		</PageWrapper>
	);
}
