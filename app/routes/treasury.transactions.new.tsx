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
	type MinuteFile,
	ReimbursementForm,
} from "~/components/treasury/reimbursement-form";
import {
	TransactionDetailsForm,
} from "~/components/treasury/transaction-details-form";
import { TransactionItemList } from "~/components/treasury/transaction-item-list";
import {
	LinkExistingSelector,
	purchasesToLinkableItems,
} from "~/components/treasury/link-existing-selector";
import { ReservationLinkSection } from "~/components/treasury/reservation-link-section";
import { CheckboxOption } from "~/components/treasury/checkbox-option";
import { Divider } from "~/components/treasury/divider";
import { LinkedItemInfo } from "~/components/treasury/linked-item-info";
import { SectionCard } from "~/components/treasury/section-card";

import { Button } from "~/components/ui/button";
import { useNewTransaction } from "~/contexts/new-transaction-context";
import {
	type NewTransaction as DbNewTransaction,
	getDatabase,
	type InventoryItem,
	type NewInventoryItem,
	type NewPurchase,
	type Purchase,
} from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { clearCache } from "~/lib/cache.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { RECEIPT_MAX_SIZE_BYTES } from "~/lib/constants";
import {
	buildMinutesAttachment,
	buildReceiptAttachments,
	isEmailConfigured,
	sendReimbursementEmail,
} from "~/lib/email.server";
import {
	getOrCreateReceiptsFolder,
	getReceiptsByYear,
	uploadReceiptToDrive,
} from "~/lib/google.server";
import {
	getMissingReceiptsError,
	MISSING_RECEIPTS_ERROR,
	parseReceiptLinks,
	RECEIPTS_SECTION_ID,
} from "~/lib/treasury/receipt-validation";
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
	await requirePermission(request, "transactions:write", getDatabase);
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

	// Get receipts for picker
	const receiptsByYear = await getReceiptsByYear();
	const currentYearReceipts = receiptsByYear.find(
		(r) => r.year === new Date().getFullYear().toString(),
	);

	// Get purchases without linked transactions (for linking selector)
	const unlinkedPurchases = await db.getPurchasesWithoutTransactions();

	// Get open reservations for current year (for linking expenses to reserved funds)
	const currentYear = new Date().getFullYear();
	const openReservations = await db.getOpenFundReservationsByYear(currentYear);

	// Enrich reservations with used/remaining amounts
	const enrichedReservations = [];
	for (const reservation of openReservations) {
		const usedAmount = await db.getReservationUsedAmount(reservation.id);
		const remainingAmount = Number.parseFloat(reservation.amount) - usedAmount;
		enrichedReservations.push({
			...reservation,
			usedAmount,
			remainingAmount,
		});
	}

	return {
		siteConfig: SITE_CONFIG,
		currentYear,
		recentMinutes: [] as MinuteFile[],
		emailConfigured: isEmailConfigured(),
		// Pre-fill data
		prefill: {
			amount: prefillAmount,
			description: prefillDescription,
			type: prefillType || "expense",
			category: prefillCategory,
			itemIds: itemSelections.map((s) => s.itemId).join(","),
			linkPurchaseId: "",
			date: "",
		},
		linkedItems,
		// Inventory picker data - now includes availableQuantity
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		// Receipt picker data
		receiptsByYear,
		receiptsFolderUrl: currentYearReceipts?.folderUrl || "#",
		// Unlinked purchases for linking selector
		unlinkedPurchases,
		// Open reservations for linking expenses
		openReservations: enrichedReservations,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const user = await requirePermission(request, "transactions:write", getDatabase);
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

	// Handle updateField action for inline editing inventory items
	if (actionType === "updateField") {
		const itemId = formData.get("itemId") as string;
		const field = formData.get("field") as string;
		const value = formData.get("value") as string;

		if (!itemId || !field) {
			return { success: false, error: "Missing itemId or field" };
		}

		// Validate field name
		const allowedFields = ["name", "quantity", "location", "category", "description", "value"];
		if (!allowedFields.includes(field)) {
			return { success: false, error: "Invalid field" };
		}

		// Parse value based on field type
		let parsedValue: string | number = value;
		if (field === "quantity") {
			parsedValue = parseInt(value, 10) || 1;
		}

		await db.updateInventoryItem(itemId, { [field]: parsedValue });
		return { success: true };
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

	// Guard: if actionType was set but not handled above, return early to prevent fall-through
	if (actionType) {
		console.warn(`[Action] Unhandled action type: ${actionType}`);
		return { success: false, error: `Unhandled action type: ${actionType}` };
	}

	const type = formData.get("type") as "income" | "expense";
	const amount = formData.get("amount") as string;
	const description = formData.get("description") as string;
	const category = (formData.get("category") as string) || null;
	const dateString = formData.get("date") as string;
	const year = parseInt(formData.get("year") as string, 10);
	const requestReimbursement = formData.get("requestReimbursement") === "on";
	const linkPurchaseId = formData.get("linkPurchaseId") as string;

	// Check if linking to an existing purchase (reimbursement request)
	const isLinkingToExisting = !!linkPurchaseId;
	const shouldRequestReimbursement = requestReimbursement && !isLinkingToExisting;

	// Determine status based on reimbursement request or linking to existing
	const status = shouldRequestReimbursement || isLinkingToExisting ? "pending" : "complete";
	const reimbursementStatus =
		shouldRequestReimbursement || isLinkingToExisting ? "requested" : "not_requested";

	// Create purchase record if reimbursement requested, or use existing purchase
	let purchaseId: string | null = isLinkingToExisting ? linkPurchaseId : null;

	if (shouldRequestReimbursement) {
		const purchaserName = formData.get("purchaserName") as string;
		const bankAccount = formData.get("bankAccount") as string;
		const minutesId = formData.get("minutesId") as string;
		const minutesName = formData.get("minutesName") as string;
		// minutesUrl removed - files are attached instead of linked

		const notes = formData.get("notes") as string;

		const receiptLinks = parseReceiptLinks(formData);
		const receiptError = getMissingReceiptsError(
			receiptLinks,
			shouldRequestReimbursement,
		);
		if (receiptError) {
			return { success: false, error: receiptError };
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
			createdBy: user.userId,
		};

		const purchase = await db.createPurchase(newPurchase);
		purchaseId = purchase.id;

		// Send email with minutes + receipt attachments in background
		const receiptAttachmentsPromise = buildReceiptAttachments(receiptLinks);
		const minutesAttachmentPromise = buildMinutesAttachment(
			minutesId,
			minutesName,
		);
		const emailTask = Promise.all([
			minutesAttachmentPromise,
			receiptAttachmentsPromise,
		])
			.then(([minutesAttachment, receiptAttachments]) =>
				sendReimbursementEmail(
					{
						itemName: description,
						itemValue: amount,
						purchaserName,
						bankAccount,
						minutesReference:
							minutesName || minutesId || "Ei määritetty / Not specified",
						notes,
						receiptLinks: receiptLinks.length > 0 ? receiptLinks : undefined,
					},
					purchase.id,
					minutesAttachment || undefined,
					receiptAttachments,
				),
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
		await emailTask;
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
		createdBy: user.userId,
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

	// Link to reservation if provided (for expenses from reserved funds)
	const reservationId = formData.get("reservationId") as string;
	const reservationAmount = formData.get("reservationAmount") as string;
	console.log("[DEBUG] Reservation linking:", { reservationId, reservationAmount, type });
	if (reservationId && type === "expense") {
		// Verify reservation exists before linking
		const reservation = await db.getFundReservationById(reservationId);
		console.log("[DEBUG] Found reservation:", reservation);
		if (reservation) {
			// Parse the amount - default to transaction amount if not specified
			const linkAmount = reservationAmount
				? reservationAmount.replace(",", ".")
				: amount.replace(",", ".");
			console.log("[DEBUG] Linking with amount:", linkAmount);
			await db.linkTransactionToReservation(transaction.id, reservationId, linkAmount);
		} else {
			console.warn(`[DEBUG] Reservation ${reservationId} not found in database, skipping link`);
		}
	}

	return redirect(`/treasury?year=${year}&success=transaction_created`);
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
		unlinkedPurchases,
		openReservations,
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
			linkPurchaseId: "",
			date: "",
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
		unlinkedPurchases: [] as Purchase[],
		openReservations: [] as Array<{
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
		navigation.state === "submitting" || fetcher.state === "submitting";

	// Get items from context (set by inventory page)
	const { items: contextItems, setItems } = useNewTransaction();
	const { t } = useTranslation();

	const [requestReimbursement, setRequestReimbursement] = useState(false);
	const [selectedPurchaseId, setSelectedPurchaseId] = useState("");
	const [selectedReservationId, setSelectedReservationId] = useState("");


	// Handle selection change - uncheck checkbox when selecting existing purchase
	const handlePurchaseSelectionChange = (id: string) => {
		setSelectedPurchaseId(id);
		if (id) {
			setRequestReimbursement(false);
		}
	};

	// Handle checkbox change - clear selection when checking request reimbursement
	const handleRequestReimbursementChange = (checked: boolean) => {
		setRequestReimbursement(checked);
		if (checked) {
			setSelectedPurchaseId("");
		}
	};
	const [transactionType, setTransactionType] = useState<"income" | "expense">(
		prefill.type,
	);
	const [amount, setAmount] = useState(prefill.amount || "");
	const [descriptionValue, setDescriptionValue] = useState(
		prefill.description || "",
	);
	const [dateValue, setDateValue] = useState(
		prefill.date || new Date().toISOString().split("T")[0],
	);

	// Update form values when a purchase is selected for linking
	useEffect(() => {
		if (selectedPurchaseId) {
			const purchase = unlinkedPurchases.find((p) => p.id === selectedPurchaseId);
			if (purchase) {
				setAmount(purchase.amount);
				setDescriptionValue(purchase.description || "");
				setDateValue(new Date(purchase.createdAt).toISOString().split("T")[0]);
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
			if (actionData.error === MISSING_RECEIPTS_ERROR) {
				const receiptsSection = document.getElementById(RECEIPTS_SECTION_ID);
				receiptsSection?.focus();
				receiptsSection?.scrollIntoView({ behavior: "smooth", block: "center" });
			}
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

	// Use context items for the transaction
	// selectedItemIds track which items are selected (for form submission)
	const [selectedItemIds, setSelectedItemIds] = useState<string[]>(
		contextItems.length > 0
			? contextItems.map((i) => i.itemId)
			: prefill.itemIds
				? prefill.itemIds.split(",").filter(Boolean)
				: [],
	);

	// Year state for controlled component
	const [year, setYear] = useState(currentYear);

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

	// Handler for inline editing inventory items
	const handleInlineEdit = (itemId: string, field: string, value: string) => {
		const formData = new FormData();
		formData.set("_action", "updateField");
		formData.set("itemId", itemId);
		formData.set("field", field);
		formData.set("value", value);
		fetcher.submit(formData, { method: "POST" });
	};

	// Convert purchases to linkable items
	const linkablePurchases = purchasesToLinkableItems(unlinkedPurchases);

	// Find selected purchase for display
	const selectedPurchase = selectedPurchaseId
		? unlinkedPurchases.find((p) => p.id === selectedPurchaseId)
		: null;

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-8">
				<PageHeader title={t("treasury.new.header")} />

				<Form method="post" encType="multipart/form-data" className="space-y-6">
					{/* Hidden field for selected item IDs */}
					<input
						type="hidden"
						name="linkedItemIds"
						value={selectedItemIds.join(",")}
					/>

					{/* Transaction Details */}
					<TransactionDetailsForm
						transactionType={transactionType}
						onTypeChange={setTransactionType}
						amount={amount}
						onAmountChange={setAmount}
						description={descriptionValue}
						onDescriptionChange={setDescriptionValue}
						category={selectedCategory}
						onCategoryChange={setSelectedCategory}
						date={dateValue}
						onDateChange={setDateValue}
						year={year}
						onYearChange={setYear}
						yearOptions={yearOptions}
						showTypeSelector={true}
					/>

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
								onInlineEdit={handleInlineEdit}
								title={t("treasury.new.inventory_title")}
								description={t("treasury.new.inventory_desc")}
								emptyMessage={t("treasury.new.inventory_empty")}
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

					{/* Fund Reservation Section - Only for expenses when reservations exist */}
					{transactionType === "expense" && (
						<ReservationLinkSection
							openReservations={openReservations}
							selectedReservationId={selectedReservationId}
							onSelectionChange={setSelectedReservationId}
							amount={amount}
						/>
					)}

					{/* Reimbursement Section - Only for expenses */}
					{transactionType === "expense" && (
						<SectionCard>
							{/* Hidden input for linking to existing purchase */}
							<input type="hidden" name="linkPurchaseId" value={selectedPurchaseId} />

							{/* Link to existing reimbursement section */}
							{unlinkedPurchases.length > 0 && (
								<>
									<LinkExistingSelector
										items={linkablePurchases}
										selectedId={selectedPurchaseId}
										onSelectionChange={handlePurchaseSelectionChange}
										label={t("treasury.new.link_existing_reimbursement")}
										helpText={t("treasury.new.link_existing_help")}
										placeholder={t("treasury.new.select_reimbursement_placeholder")}
										noLinkText={t("treasury.new.no_link")}
									/>
									{selectedPurchase && (
										<LinkedItemInfo purchase={selectedPurchase} canViewFullBankAccount={true} />
									)}
								</>
							)}

							{/* Divider when both options available */}
							{unlinkedPurchases.length > 0 && (
								<Divider translationKey="treasury.new.or" />
							)}

							{/* Request new reimbursement - always shown */}
							<CheckboxOption
								id="requestReimbursement"
								name="requestReimbursement"
								checked={requestReimbursement}
								onCheckedChange={handleRequestReimbursementChange}
								label={t("treasury.new.request_reimbursement")}
								helpText={t("treasury.new.reimbursement_help")}
							>
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
							</CheckboxOption>
						</SectionCard>
					)}

					<div className="flex gap-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate(-1)}
							className="flex-1"
						>
							{t("common.actions.cancel")}
						</Button>
						<Button type="submit" className="flex-1" disabled={isSubmitting}>
							{isSubmitting ? (
								<span className="flex items-center gap-2">
									<span className="animate-spin material-symbols-outlined text-sm">
										progress_activity
									</span>
									<span>{t("common.status.saving")}</span>
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
