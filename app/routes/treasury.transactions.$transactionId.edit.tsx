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
	type MinuteFile,
	ReimbursementForm,
} from "~/components/treasury/reimbursement-form";
import {
	TransactionDetailsForm,
	type TransactionType,
} from "~/components/treasury/transaction-details-form";
import { TransactionItemList } from "~/components/treasury/transaction-item-list";
import {
	LinkExistingSelector,
	purchasesToLinkableItems,
} from "~/components/treasury/link-existing-selector";
import { CheckboxOption } from "~/components/treasury/checkbox-option";
import { Divider } from "~/components/treasury/divider";
import { LinkedItemInfo } from "~/components/treasury/linked-item-info";
import { SectionCard } from "~/components/treasury/section-card";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { useNewTransaction } from "~/contexts/new-transaction-context";
import {
	getDatabase,
	type InventoryItem,
	type NewInventoryItem,
	type NewPurchase,
	type Purchase,
	type ReimbursementStatus,
	type Transaction,
	type TransactionStatus,
} from "~/db";
import {
	requirePermissionOrSelf,
	requireDeletePermissionOrSelf,
	type AuthenticatedUser,
} from "~/lib/auth.server";
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

	// Check permission with self-edit support
	await requirePermissionOrSelf(
		request,
		"transactions:update",
		"transactions:update-self",
		transaction.createdBy,
		getDatabase,
	);

	// Get linked purchase if exists
	let purchase = null;
	if (transaction.purchaseId) {
		purchase = await db.getPurchaseById(transaction.purchaseId);
	}

	// Get currently linked inventory items
	const linkedItems = await db.getInventoryItemsForTransaction(
		params.transactionId,
	);

	// Get available items for picker (active, non-legacy, with available quantity)
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

	// Get receipts for picker (for new reimbursements)
	const receiptsByYear = await getReceiptsByYear();
	const currentYear = new Date().getFullYear();
	const currentYearReceipts = receiptsByYear.find(
		(r) => r.year === currentYear.toString(),
	);

	// Get purchases without linked transactions + include current purchase if linked
	const unlinkedPurchases = await db.getPurchasesWithoutTransactions();
	// Add current purchase to the list so it appears as selected option
	if (purchase && !unlinkedPurchases.find((p) => p.id === purchase.id)) {
		unlinkedPurchases.unshift(purchase);
	}

	return {
		siteConfig: SITE_CONFIG,
		transaction,
		purchase,
		linkedItems,
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		// New fields for shared components
		currentYear,
		recentMinutes: [] as MinuteFile[],
		emailConfigured: isEmailConfigured(),
		receiptsByYear,
		receiptsFolderUrl: currentYearReceipts?.folderUrl || "#",
		unlinkedPurchases,
	};
}

export async function action({ request, params }: Route.ActionArgs) {
	const db = getDatabase();

	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	// Get transaction to preserve year for redirect and check permissions
	const transactions = await db.getAllTransactions();
	const transaction = transactions.find((t) => t.id === params.transactionId);
	const year = transaction?.year || new Date().getFullYear();

	// Get user and check permission with self-edit support (will be re-checked for delete action)
	let user: AuthenticatedUser;
	if (actionType === "delete") {
		// Delete permission check happens in delete handler
		user = await requireDeletePermissionOrSelf(
			request,
			"transactions:delete",
			"transactions:delete-self",
			transaction?.createdBy,
			getDatabase,
		);
	} else {
		user = await requirePermissionOrSelf(
			request,
			"transactions:update",
			"transactions:update-self",
			transaction?.createdBy,
			getDatabase,
		);
	}

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
		const receiptYear = formData.get("year") as string;
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
				receiptYear,
				description,
			);

			if (result) {
				return { success: true, receipt: result };
			}
			return { success: false, error: "Upload failed" };
		} catch (error) {
			console.error("[uploadReceipt] Error:", error);
			return { success: false, error: "Upload failed" };
		}
	}

	// Handle ensureReceiptsFolder action for ReimbursementForm
	if (actionType === "ensureReceiptsFolder") {
		const receiptYear = formData.get("year") as string;
		try {
			const result = await getOrCreateReceiptsFolder(receiptYear);
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

	// Handle delete action
	if (actionType === "delete") {
		if (!transaction) {
			return { error: "Transaction not found" };
		}

		// Permission already checked at start of action, user is available

		// Check for linked active inventory items
		const activeItems = await db.getActiveInventoryItemsForTransaction(
			params.transactionId,
		);
		if (activeItems.length > 0) {
			const itemNames = activeItems.map((item) => item.name).join(", ");
			return {
				error: "treasury.breakdown.edit.delete_error_linked",
				linkedItemNames: itemNames,
				linkedItems: activeItems,
			};
		}

		// Delete the transaction (junction table entries should cascade or be handled)
		await db.deleteTransaction(params.transactionId);
		return redirect(
			`/treasury/breakdown?year=${year}&success=Transaction deleted`,
		);
	}

	// Handle linking items
	if (actionType === "linkItems") {
		const itemIdsJson = formData.get("itemIds") as string;
		const quantitiesJson = formData.get("quantities") as string;

		console.log("[LinkItems] itemIdsJson:", itemIdsJson);
		console.log("[LinkItems] quantitiesJson:", quantitiesJson);

		if (itemIdsJson) {
			const itemIds = JSON.parse(itemIdsJson) as string[];
			const quantities = quantitiesJson
				? (JSON.parse(quantitiesJson) as Record<string, number>)
				: {};

			console.log("[LinkItems] Parsed quantities:", quantities);

			for (const itemId of itemIds) {
				const item = await db.getInventoryItemById(itemId);
				if (item) {
					// Use provided quantity, or default to item's full quantity
					const quantity = quantities[itemId] || item.quantity;
					console.log(
						`[LinkItems] Linking ${itemId} with quantity ${quantity} (provided: ${quantities[itemId]}, item.quantity: ${item.quantity})`,
					);
					await db.linkInventoryItemToTransaction(
						itemId,
						params.transactionId,
						quantity,
					);
				}
			}
		}
		return { success: true, message: "Items linked successfully" };
	}

	// Handle unlinking a single item
	if (actionType === "unlinkItem") {
		const itemId = formData.get("itemId") as string;
		if (itemId) {
			await db.unlinkInventoryItemFromTransaction(itemId, params.transactionId);
		}
		return { success: true, message: "Item unlinked successfully" };
	}

	// Handle update action (default)
	const status = formData.get("status") as TransactionStatus;
	const reimbursementStatus = formData.get(
		"reimbursementStatus",
	) as ReimbursementStatus;
	const description = formData.get("description") as string;
	const category = (formData.get("category") as string) || null;
	const amountStr = formData.get("amount") as string;
	const amount = amountStr
		? amountStr.replace(",", ".")
		: transaction?.amount.toString();

	// Handle purchase linking/creation
	const linkPurchaseId = formData.get("linkPurchaseId") as string;
	const requestReimbursement = formData.get("requestReimbursement") === "on";
	const currentPurchaseId = transaction?.purchaseId || null;

	// Determine if linking to an existing purchase
	const isLinkingToExisting = !!linkPurchaseId;
	const shouldRequestReimbursement = requestReimbursement && !isLinkingToExisting;

	// Determine new purchaseId
	let newPurchaseId: string | null = currentPurchaseId;

	// If linking to different existing purchase
	if (isLinkingToExisting && linkPurchaseId !== currentPurchaseId) {
		newPurchaseId = linkPurchaseId;
	}
	// If creating new reimbursement
	else if (shouldRequestReimbursement) {
		const purchaserName = formData.get("purchaserName") as string;
		const bankAccount = formData.get("bankAccount") as string;
		const minutesId = formData.get("minutesId") as string;
		const minutesName = formData.get("minutesName") as string;
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
			amount: amount || "0",
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
		newPurchaseId = purchase.id;

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
						itemValue: amount || "0",
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

	// Determine statuses based on purchase
	const finalStatus = (newPurchaseId && status === "complete") ? "pending" : status;
	const finalReimbursementStatus = newPurchaseId
		? (reimbursementStatus === "not_requested" ? "requested" : reimbursementStatus)
		: reimbursementStatus;

	await db.updateTransaction(params.transactionId, {
		status: finalStatus,
		reimbursementStatus: finalReimbursementStatus,
		description,
		category,
		amount: amount || "0",
		purchaseId: newPurchaseId,
	});

	// If transaction has a linked purchase, update its status too
	if (newPurchaseId) {
		const purchaseStatus =
			finalReimbursementStatus === "approved"
				? "approved"
				: finalReimbursementStatus === "declined"
					? "rejected"
					: "pending";
		await db.updatePurchase(newPurchaseId, { status: purchaseStatus });
	}

	return redirect(`/treasury/breakdown?year=${year}`);
}

export default function EditTransaction({ loaderData }: Route.ComponentProps) {
	const {
		transaction,
		purchase,
		linkedItems,
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		currentYear,
		recentMinutes,
		emailConfigured,
		receiptsByYear,
		receiptsFolderUrl,
		unlinkedPurchases,
	} = loaderData as {
		transaction: Transaction;
		purchase: Purchase | null;
		linkedItems: (InventoryItem & { quantity: number })[];
		pickerItems: (InventoryItem & { availableQuantity: number })[];
		uniqueLocations: string[];
		uniqueCategories: string[];
		currentYear: number;
		recentMinutes: MinuteFile[];
		emailConfigured: boolean;
		receiptsByYear: Array<{
			year: string;
			files: Array<{
				id: string;
				name: string;
				url: string;
				createdTime: string;
			}>;
			folderUrl: string;
			folderId: string;
		}>;
		receiptsFolderUrl: string;
		unlinkedPurchases: Purchase[];
	};
	const navigate = useNavigate();
	const navigation = useNavigation();
	const fetcher = useFetcher();
	const isSubmitting =
		navigation.state === "submitting" || fetcher.state === "submitting";
	interface ActionData {
		success?: boolean;
		message?: string;
		error?: string;
		linkedItemNames?: string;
	}

	const actionData = useActionData<ActionData>();
	const [searchParams, setSearchParams] = useSearchParams();
	const { items: contextItems, isHydrated, clearItems, setItems } = useNewTransaction();
	const { t, i18n } = useTranslation();

	const [showDeleteDialog, setShowDeleteDialog] = useState(false);

	// Transaction form state (initialized from loaded transaction)
	const [transactionType, setTransactionType] = useState<TransactionType>(
		transaction.type as TransactionType,
	);
	const [amount, setAmount] = useState(transaction.amount);
	const [descriptionValue, setDescriptionValue] = useState(
		transaction.description,
	);
	const [category, setCategory] = useState(transaction.category || "");
	const [dateValue, setDateValue] = useState(
		new Date(transaction.date).toISOString().split("T")[0],
	);
	const [year, setYear] = useState(transaction.year);
	const [status, setStatus] = useState<TransactionStatus>(transaction.status);
	const [reimbursementStatus, setReimbursementStatus] =
		useState<ReimbursementStatus>(
			transaction.reimbursementStatus || "not_requested",
		);

	// Purchase linking state
	const [selectedPurchaseId, setSelectedPurchaseId] = useState(
		transaction.purchaseId || "",
	);
	const [requestReimbursement, setRequestReimbursement] = useState(false);
	const isLinkingToExisting = !!selectedPurchaseId;

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

	// Track pending items to add (from context)
	const [pendingItems, setPendingItems] = useState<
		{ itemId: string; name: string; quantity: number; unitValue: number }[]
	>([]);

	// Track if we've already processed the addItems param
	const hasProcessedAddItems = useRef(false);

	// Generate year options (last 5 years)
	const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

	// Load pending items from context when ?addItems=true
	useEffect(() => {
		const addItems = searchParams.get("addItems");

		// Wait for context to hydrate from sessionStorage
		if (!isHydrated) return;

		if (
			addItems === "true" &&
			contextItems.length > 0 &&
			!hasProcessedAddItems.current
		) {
			hasProcessedAddItems.current = true;

			console.log("[AddToExisting] Loading items from context:", contextItems);

			// Add context items to pending list
			setPendingItems(contextItems);

			// Clear context and remove query param
			clearItems();
			setSearchParams((prev) => {
				prev.delete("addItems");
				return prev;
			});
		}
	}, [searchParams, contextItems, isHydrated, clearItems, setSearchParams]);

	// Enforce minimum amount based on linked and pending items
	useEffect(() => {
		const linkedTotal = linkedItems.reduce(
			(sum, item) => sum + parseFloat(item.value || "0") * item.quantity,
			0,
		);
		const pendingTotal = pendingItems.reduce(
			(sum, item) => sum + item.unitValue * item.quantity,
			0,
		);
		const totalValue = linkedTotal + pendingTotal;

		setAmount((prev) => {
			const current = parseFloat(prev) || 0;
			if (totalValue > current) {
				return totalValue.toFixed(2);
			}
			return prev;
		});
	}, [linkedItems, pendingItems]);

	// Handle linking pending items
	const handleLinkPendingItems = () => {
		for (const item of pendingItems) {
			fetcher.submit(
				{
					_action: "linkItems",
					itemIds: JSON.stringify([item.itemId]),
					quantities: JSON.stringify({ [item.itemId]: item.quantity }),
				},
				{ method: "POST" },
			);
		}
		setPendingItems([]);
		toast.success(t("treasury.breakdown.edit.items_linked_success"));
	};

	const formatCurrency = (value: string | number) => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		return `${num.toFixed(2).replace(".", ",")} €`;
	};

	const handleDelete = () => {
		fetcher.submit({ _action: "delete" }, { method: "POST" });
		setShowDeleteDialog(false);
	};

	const handleUnlinkItem = (itemId: string) => {
		fetcher.submit(
			{
				_action: "unlinkItem",
				itemId,
			},
			{ method: "POST" },
		);
	};

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

	// Show toast on success/error
	useEffect(() => {
		if (
			fetcher.state === "idle" &&
			fetcher.data &&
			typeof fetcher.data === "object" &&
			"success" in fetcher.data
		) {
			const data = fetcher.data as { message?: string };
			toast.success(data.message || "Action completed");
		}
	}, [fetcher.state, fetcher.data]);

	useEffect(() => {
		if (actionData && "error" in actionData && actionData.error) {
			toast.error(
				typeof actionData.error === "string"
					? t(actionData.error, { names: actionData.linkedItemNames })
					: "An error occurred",
			);
			if (actionData.error === MISSING_RECEIPTS_ERROR) {
				const receiptsSection = document.getElementById(RECEIPTS_SECTION_ID);
				receiptsSection?.focus();
				receiptsSection?.scrollIntoView({ behavior: "smooth", block: "center" });
			}
		}
	}, [actionData, t]);

	// Check for delete error from action
	const deleteError =
		actionData?.error === "treasury.breakdown.edit.delete_error_linked"
			? t(actionData.error, { names: actionData.linkedItemNames })
			: null;

	// Convert purchases to linkable items
	const linkablePurchases = purchasesToLinkableItems(unlinkedPurchases);

	// Find selected purchase for display
	const selectedPurchase = selectedPurchaseId
		? unlinkedPurchases.find((p) => p.id === selectedPurchaseId)
		: null;

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader title={t("treasury.breakdown.edit.title")} />

				{/* Error display */}
				{deleteError && (
					<div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
						<div className="flex items-start gap-3">
							<span className="material-symbols-outlined text-red-600 dark:text-red-400">
								error
							</span>
							<div>
								<p className="font-medium text-red-800 dark:text-red-300">
									{t("treasury.breakdown.edit.delete_blocked")}
								</p>
								<p className="text-sm text-red-700 dark:text-red-400 mt-1">
									{deleteError}
								</p>
							</div>
						</div>
					</div>
				)}

				<Form method="post" encType="multipart/form-data" className="space-y-6">
					{/* Hidden fields for form submission */}
					<input type="hidden" name="linkPurchaseId" value={selectedPurchaseId} />

					{/* Transaction Details Form - type and year disabled in edit mode */}
					<TransactionDetailsForm
						transactionType={transactionType}
						onTypeChange={setTransactionType}
						amount={amount}
						onAmountChange={setAmount}
						description={descriptionValue}
						onDescriptionChange={setDescriptionValue}
						category={category}
						onCategoryChange={setCategory}
						date={dateValue}
						onDateChange={setDateValue}
						year={year}
						onYearChange={setYear}
						yearOptions={yearOptions}
						showTypeSelector={true}
						showYearSelector={true}
						disabled={true}
					/>

					{/* Inventory Items Section - shown when category is "inventory" */}
					{category === "inventory" && (
						<div className="space-y-4">
							<TransactionItemList
								items={pendingItems}
								onItemsChange={(newItems) => {
									setPendingItems(newItems);
									setItems(newItems);
								}}
								availableItems={pickerItems}
								uniqueLocations={uniqueLocations}
								uniqueCategories={uniqueCategories}
								onAddNewItem={handleAddItem}
								title={t("treasury.breakdown.edit.items_to_add")}
								description={t("treasury.breakdown.edit.items_to_add_desc")}
								emptyMessage={t("treasury.breakdown.edit.no_items_to_add")}
								showTotal={false}
							/>

							{pendingItems.length > 0 && (
								<div className="flex justify-end">
									<Button
										type="button"
										onClick={handleLinkPendingItems}
										variant="default"
										className="gap-2"
									>
										<span className="material-symbols-outlined">link</span>
										{t("treasury.breakdown.edit.link_items", {
											count: pendingItems.length,
										})}
									</Button>
								</div>
							)}

							{/* Currently Linked Items */}
							{linkedItems.length > 0 && (
								<div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
									<h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
										{t("treasury.breakdown.edit.linked_items")}
									</h3>
									<div className="space-y-2">
										{linkedItems.map((item) => (
											<div
												key={item.id}
												className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
											>
												<div className="flex items-center gap-3">
													<span className="material-symbols-outlined text-gray-400">
														package_2
													</span>
													<div>
														<p className="font-medium">{item.name}</p>
														<p className="text-xs text-gray-500">
															{item.quantity} {t("inventory.unit")} •{" "}
															{item.location}
															{item.value && parseFloat(item.value) > 0 && (
																<span className="ml-2">
																	{formatCurrency(
																		parseFloat(item.value) * item.quantity,
																	)}
																</span>
															)}
														</p>
													</div>
												</div>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => handleUnlinkItem(item.id)}
													className="text-red-600 hover:text-red-700 hover:bg-red-50"
												>
													<span className="material-symbols-outlined text-base">
														link_off
													</span>
												</Button>
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					)}

					{/* Reimbursement Section - Only for expenses */}
					{transactionType === "expense" && (
						<SectionCard>
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
										<LinkedItemInfo purchase={selectedPurchase} />
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

							{/* Show linked purchase info if already linked but not selecting a new one */}
							{purchase && isLinkingToExisting && !selectedPurchaseId && (
								<LinkedItemInfo purchase={purchase} />
							)}
						</SectionCard>
					)}

					<div className="flex gap-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate(-1)}
							className="flex-1"
						>
							{t("treasury.breakdown.edit.cancel")}
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
								t("treasury.breakdown.edit.save")
							)}
						</Button>
					</div>
				</Form>

				{/* Delete section - separate from main form */}
				<div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
					<AlertDialog
						open={showDeleteDialog}
						onOpenChange={setShowDeleteDialog}
					>
						<AlertDialogTrigger asChild>
							<Button type="button" variant="destructive" className="w-full">
								<span className="material-symbols-outlined mr-2">delete</span>
								{t("treasury.breakdown.edit.delete")}
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									{t("treasury.breakdown.edit.delete_title")}
								</AlertDialogTitle>
								<AlertDialogDescription>
									<span className="block mb-2">
										{t("treasury.breakdown.edit.delete_confirm")}
									</span>
									<span className="block mt-3 font-medium text-foreground">
										{transaction.description} (
										{formatCurrency(transaction.amount)})
									</span>
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>
									{t("treasury.breakdown.edit.cancel")}
								</AlertDialogCancel>
								<AlertDialogAction
									onClick={handleDelete}
									className="bg-red-600 hover:bg-red-700"
								>
									{t("treasury.breakdown.edit.delete")}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>
		</PageWrapper>
	);
}
