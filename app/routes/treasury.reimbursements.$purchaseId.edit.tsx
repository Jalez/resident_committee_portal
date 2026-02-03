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
import { TransactionDetailsForm } from "~/components/treasury/transaction-details-form";
import { TransactionItemList } from "~/components/treasury/transaction-item-list";
import {
	LinkExistingSelector,
	transactionsToLinkableItems,
} from "~/components/treasury/link-existing-selector";
import { SectionCard } from "~/components/treasury/section-card";
import { CheckboxOption } from "~/components/treasury/checkbox-option";
import { Divider } from "~/components/treasury/divider";
import { LinkedItemInfo } from "~/components/treasury/linked-item-info";
import { Button } from "~/components/ui/button";
import { useNewTransaction } from "~/contexts/new-transaction-context";
import {
	getDatabase,
	type InventoryItem,
	type NewInventoryItem,
	type NewTransaction,
	type Purchase,
	type Transaction,
} from "~/db";
import { requirePermissionOrSelf } from "~/lib/auth.server";
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
import type { Route } from "./+types/treasury.reimbursements.$purchaseId.edit";

export function meta({ data }: Route.MetaArgs) {
	const description = data?.purchase?.description;
	const title = description
		? `Muokkaa: ${description.substring(0, 30)} / Edit Reimbursement`
		: "Muokkaa kulukorvausta / Edit Reimbursement";
	return [
		{ title: `${data?.siteConfig?.name || "Portal"} - ${title}` },
		{ name: "robots", content: "noindex" },
	];
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const db = getDatabase();

	const purchase = await db.getPurchaseById(params.purchaseId);

	if (!purchase) {
		throw new Response("Not Found", { status: 404 });
	}

	// Check permission with self-edit support
	await requirePermissionOrSelf(
		request,
		"reimbursements:update",
		"reimbursements:update-self",
		purchase.createdBy,
		getDatabase,
	);

	// Get linked transaction if exists
	let linkedTransaction = null;
	if (purchase.id) {
		linkedTransaction = await db.getTransactionByPurchaseId(purchase.id);
	}

	// Get receipts for picker
	const receiptsByYear = await getReceiptsByYear();
	const currentYear = new Date().getFullYear();
	const currentYearReceipts = receiptsByYear.find(
		(r) => r.year === currentYear.toString(),
	);

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

	// Get transactions without reimbursements (for linking selector)
	const unlinkedTransactions =
		await db.getExpenseTransactionsWithoutReimbursement();

	// Add current linked transaction to the list so it appears as selected option
	if (linkedTransaction && !unlinkedTransactions.find((t) => t.id === linkedTransaction.id)) {
		unlinkedTransactions.unshift(linkedTransaction);
	}

	return {
		siteConfig: SITE_CONFIG,
		purchase,
		linkedTransaction,
		currentYear,
		recentMinutes: [] as MinuteFile[],
		emailConfigured: isEmailConfigured(),
		receiptsByYear,
		receiptsFolderUrl: currentYearReceipts?.folderUrl || "#",
		// Inventory picker data
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		// Unlinked transactions for linking selector
		unlinkedTransactions,
	};
}

export async function action({ request, params }: Route.ActionArgs) {
	const db = getDatabase();

	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	// Get purchase to preserve year for redirect and check permissions
	const purchase = await db.getPurchaseById(params.purchaseId);
	if (!purchase) {
		throw new Response("Not Found", { status: 404 });
	}

	const year = purchase.year;

	// Check permission with self-edit support
	const user = await requirePermissionOrSelf(
		request,
		"reimbursements:update",
		"reimbursements:update-self",
		purchase.createdBy,
		getDatabase,
	);

	// Handle createItem action for InventoryPicker (if needed in future)
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

	// Guard: if actionType was set but not handled above, return early to prevent fall-through
	if (actionType) {
		console.warn(`[Action] Unhandled action type: ${actionType}`);
		return { success: false, error: `Unhandled action type: ${actionType}` };
	}

	// Handle update action (default)
	const linkTransactionId = formData.get("linkTransactionId") as string;
	const isLinkingToExisting = !!linkTransactionId;
	const createTransaction = formData.get("createTransaction") === "on";
	const currentLinkedTransaction = await db.getTransactionByPurchaseId(params.purchaseId);

	const purchaserName = formData.get("purchaserName") as string;
	const bankAccount = formData.get("bankAccount") as string;
	const minutesId = formData.get("minutesId") as string;
	const minutesName = formData.get("minutesName") as string;
	const notes = formData.get("notes") as string;
	const resendReimbursementRequest = formData.get("resendReimbursementRequest") === "on";

	// Parse receipt links
	const receiptLinks = parseReceiptLinks(formData);

	// Only validate receipts if resending email
	if (resendReimbursementRequest) {
		const receiptError = getMissingReceiptsError(receiptLinks, true);
		if (receiptError) {
			return { success: false, error: receiptError };
		}
	}

	// Handle transaction linking/creation
	if (isLinkingToExisting && linkTransactionId !== currentLinkedTransaction?.id) {
		// Link to different existing transaction
		const existingTransaction = (await db.getAllTransactions()).find(
			(t) => t.id === linkTransactionId,
		);
		if (!existingTransaction) {
			return { success: false, error: "Transaction not found" };
		}

		// Unlink current transaction if exists
		if (currentLinkedTransaction) {
			await db.updateTransaction(currentLinkedTransaction.id, {
				purchaseId: null,
				reimbursementStatus: "not_requested",
			});
		}

		// Link new transaction
		await db.updateTransaction(linkTransactionId, {
			purchaseId: params.purchaseId,
			status: "pending",
			reimbursementStatus: "requested",
		});

		// Update purchase amount and description from transaction
		await db.updatePurchase(params.purchaseId, {
			purchaserName,
			bankAccount,
			minutesId,
			minutesName: minutesName || null,
			notes: notes || null,
			amount: existingTransaction.amount,
			description: existingTransaction.description,
		});
	} else if (createTransaction) {
		// Create new transaction and link to purchase
		const description = formData.get("description") as string;
		const amount = formData.get("amount") as string;
		const category = (formData.get("category") as string) || "other";
		const dateString = formData.get("date") as string;
		const transactionYear = parseInt(formData.get("year") as string, 10);

		// Unlink current transaction if exists
		if (currentLinkedTransaction) {
			await db.updateTransaction(currentLinkedTransaction.id, {
				purchaseId: null,
				reimbursementStatus: "not_requested",
			});
		}

		// Create new transaction
		const newTransaction: NewTransaction = {
			type: "expense",
			amount,
			description,
			category,
			date: new Date(dateString),
			year: transactionYear,
			status: "pending",
			reimbursementStatus: "requested",
			purchaseId: params.purchaseId,
			createdBy: user.userId,
		};
		const transaction = await db.createTransaction(newTransaction);

		// Link inventory items if provided
		const linkedItemIds = formData.get("linkedItemIds") as string;
		if (linkedItemIds) {
			const ids = linkedItemIds.split(",").filter(Boolean);
			for (const itemId of ids) {
				const quantityField = formData.get(`itemQuantity_${itemId}`) as string;
				const quantity = quantityField ? parseInt(quantityField, 10) : null;

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

		// Update purchase amount and description from transaction
		await db.updatePurchase(params.purchaseId, {
			purchaserName,
			bankAccount,
			minutesId,
			minutesName: minutesName || null,
			notes: notes || null,
			amount,
			description,
		});
	} else {
		// Update purchase only (no transaction changes)
		await db.updatePurchase(params.purchaseId, {
			purchaserName,
			bankAccount,
			minutesId,
			minutesName: minutesName || null,
			notes: notes || null,
		});
	}

	// If resend reimbursement request is checked, send email
	if (resendReimbursementRequest) {
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
						itemName: purchase.description || "Reimbursement request",
						itemValue: purchase.amount,
						purchaserName,
						bankAccount,
						minutesReference: minutesName || minutesId || "Ei määritetty / Not specified",
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
						emailError: null, // Clear any previous errors
					});
				} else {
					await db.updatePurchase(purchase.id, {
						emailError: emailResult.error || "Email sending failed",
					});
				}
			})
			.catch(async (error) => {
				console.error("[Reimbursement Edit] Email error:", error);
				await db.updatePurchase(purchase.id, {
					emailError: error instanceof Error ? error.message : "Unknown error",
				});
			});
		await emailTask;
	}

	return redirect(`/treasury/reimbursements?year=${year}&success=Reimbursement updated`);
}

export default function EditReimbursement({ loaderData }: Route.ComponentProps) {
	const {
		purchase,
		linkedTransaction,
		currentYear,
		recentMinutes,
		emailConfigured,
		receiptsByYear,
		receiptsFolderUrl,
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		unlinkedTransactions,
	} = loaderData as {
		purchase: Purchase;
		linkedTransaction: Transaction | null;
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
		pickerItems: (InventoryItem & { availableQuantity: number })[];
		uniqueLocations: string[];
		uniqueCategories: string[];
		unlinkedTransactions: Transaction[];
	};
	const navigate = useNavigate();
	const fetcher = useFetcher();
	const actionData = useActionData<typeof action>();
	const { t } = useTranslation();
	const { items: contextItems, setItems } = useNewTransaction();

	const navigation = useNavigation();
	const isSubmitting =
		navigation.state === "submitting" || fetcher.state === "submitting";

	// Resend reimbursement request checkbox state
	const [resendReimbursementRequest, setResendReimbursementRequest] = useState(false);

	// Link to existing transaction state
	const [selectedTransactionId, setSelectedTransactionId] = useState(
		linkedTransaction?.id || "",
	);

	// Create new transaction state (checkbox like in transactions.new.tsx)
	const [createTransaction, setCreateTransaction] = useState(false);

	// Handle selection change - uncheck checkbox when selecting existing transaction
	const handleTransactionSelectionChange = (id: string) => {
		setSelectedTransactionId(id);
		if (id) {
			setCreateTransaction(false);
		}
	};

	// Handle checkbox change - clear selection when checking create transaction
	const handleCreateTransactionChange = (checked: boolean) => {
		setCreateTransaction(checked);
		if (checked) {
			setSelectedTransactionId("");
		}
	};

	// Transaction details state (initialized from linked transaction or purchase)
	const [amount, setAmount] = useState(
		linkedTransaction?.amount || purchase.amount,
	);
	const [descriptionValue, setDescriptionValue] = useState(
		linkedTransaction?.description || purchase.description || "",
	);
	const [category, setCategory] = useState(linkedTransaction?.category || "other");
	const [dateValue, setDateValue] = useState(
		linkedTransaction
			? new Date(linkedTransaction.date).toISOString().split("T")[0]
			: new Date().toISOString().split("T")[0],
	);
	const [year, setYear] = useState(linkedTransaction?.year || purchase.year);

	// Inventory item selection
	const [selectedItemIds, setSelectedItemIds] = useState<string[]>(
		contextItems.length > 0 ? contextItems.map((i) => i.itemId) : [],
	);

	// Generate year options (last 5 years)
	const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

	// Update form values when a transaction is selected for linking
	useEffect(() => {
		if (selectedTransactionId) {
			const transaction = unlinkedTransactions.find(
				(t) => t.id === selectedTransactionId,
			);
			if (transaction) {
				setAmount(transaction.amount);
				setDescriptionValue(transaction.description);
				setCategory(transaction.category || "other");
				setDateValue(new Date(transaction.date).toISOString().split("T")[0]);
				setYear(transaction.year);
			}
		}
	}, [selectedTransactionId, unlinkedTransactions]);

	// Sync amount with inventory items total when quantities change
	useEffect(() => {
		if (contextItems.length > 0 && !selectedTransactionId) {
			const total = contextItems.reduce(
				(sum, item) => sum + item.quantity * item.unitValue,
				0,
			);
			if (total > 0) {
				setAmount(total.toFixed(2));
			}
		}
	}, [contextItems, selectedTransactionId]);

	useEffect(() => {
		if (actionData && "error" in actionData && actionData.error) {
			toast.error(
				typeof actionData.error === "string"
					? actionData.error
					: t("treasury.reimbursements.edit.error"),
			);
			if (actionData.error === MISSING_RECEIPTS_ERROR) {
				const receiptsSection = document.getElementById(RECEIPTS_SECTION_ID);
				receiptsSection?.focus();
				receiptsSection?.scrollIntoView({ behavior: "smooth", block: "center" });
			}
		}
	}, [actionData, t]);

	// Handle fetcher success (inventory item creation)
	useEffect(() => {
		if (fetcher.data && "success" in fetcher.data && fetcher.data.success) {
			toast.success("Inventory item created");
		}
	}, [fetcher.data]);

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

	// Handler for inline editing inventory items
	const handleInlineEdit = (itemId: string, field: string, value: string) => {
		const formData = new FormData();
		formData.set("_action", "updateField");
		formData.set("itemId", itemId);
		formData.set("field", field);
		formData.set("value", value);
		fetcher.submit(formData, { method: "POST" });
	};

	const linkableItems = transactionsToLinkableItems(
		unlinkedTransactions as (Transaction & { purchaseId: string | null })[],
	);

	// Find selected transaction for display
	const selectedTransaction = selectedTransactionId
		? unlinkedTransactions.find((t) => t.id === selectedTransactionId)
		: null;

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4">
				<PageHeader title={t("treasury.reimbursements.edit.title")} />

				<Form method="post" encType="multipart/form-data" className="space-y-6">
					{/* Reimbursement Form */}
					<SectionCard>
						<h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
							{t("treasury.reimbursements.edit.reimbursement_details")}
						</h2>
						<ReimbursementForm
							recentMinutes={recentMinutes}
							emailConfigured={emailConfigured}
							receiptsByYear={receiptsByYear}
							currentYear={currentYear}
							receiptsFolderUrl={receiptsFolderUrl}
							description={descriptionValue || purchase.description || ""}
							showNotes={true}
							showEmailWarning={true}
							required={resendReimbursementRequest}
							initialPurchaserName={purchase.purchaserName}
							initialBankAccount={purchase.bankAccount}
							initialNotes={purchase.notes || ""}
						/>
					</SectionCard>

					{/* Transaction Section - Link or Create */}
					<SectionCard>
						{/* Hidden input for createTransaction checkbox */}
						<input type="hidden" name="createTransaction" value={createTransaction ? "on" : ""} />
						<input
							type="hidden"
							name="linkTransactionId"
							value={selectedTransactionId}
						/>
						<input
							type="hidden"
							name="linkedItemIds"
							value={selectedItemIds.join(",")}
						/>

						{/* Link to existing transaction option */}
						{unlinkedTransactions.length > 0 && (
							<>
								<LinkExistingSelector
									items={linkableItems}
									selectedId={selectedTransactionId}
									onSelectionChange={handleTransactionSelectionChange}
									label={t("treasury.new_reimbursement.link_existing_transaction")}
									helpText={t(
										"treasury.new_reimbursement.link_existing_transaction_help",
									)}
									placeholder={t(
										"treasury.new_reimbursement.select_transaction_placeholder",
									)}
									noLinkText={t("treasury.new_reimbursement.no_link")}
								/>
								{selectedTransaction && (
									<LinkedItemInfo
										description={descriptionValue}
										amount={amount}
										date={dateValue}
										year={year}
									/>
								)}
							</>
						)}

						{/* Divider when both options available */}
						{unlinkedTransactions.length > 0 && (
							<Divider translationKey="treasury.new.or" />
						)}

						{/* Create new transaction checkbox - always shown */}
						<CheckboxOption
							id="createTransaction"
							name="createTransactionCheckbox"
							checked={createTransaction}
							onCheckedChange={handleCreateTransactionChange}
							label={t("treasury.new_reimbursement.create_transaction")}
							helpText={t("treasury.new_reimbursement.create_transaction_help")}
						>
							<TransactionDetailsForm
								transactionType="expense"
								onTypeChange={() => { }}
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
								showTypeSelector={false}
								showCard={false}
							/>

							{/* Inventory Selection Section - shown when category is "inventory" */}
							{category === "inventory" && (
								<div className="space-y-4 mt-4">
									<TransactionItemList
										items={contextItems}
										onItemsChange={(newItems) => {
											setItems(newItems);
											setSelectedItemIds(newItems.map((i) => i.itemId));
										}}
										availableItems={pickerItems}
										uniqueLocations={uniqueLocations}
										uniqueCategories={uniqueCategories}
										onAddNewItem={handleAddItem}
										onInlineEdit={handleInlineEdit}
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
						</CheckboxOption>
					</SectionCard>

					{/* Resend Reimbursement Request Checkbox */}
					<SectionCard>
						<CheckboxOption
							id="resendReimbursementRequest"
							name="resendReimbursementRequest"
							checked={resendReimbursementRequest}
							onCheckedChange={setResendReimbursementRequest}
							label={t("treasury.reimbursements.edit.resend_reimbursement_request")}
							helpText={t("treasury.reimbursements.edit.resend_reimbursement_request_help")}
						/>
					</SectionCard>

					<div className="flex gap-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate(-1)}
							className="flex-1"
						>
							{t("treasury.reimbursements.edit.cancel")}
						</Button>
						<Button type="submit" className="flex-1" disabled={isSubmitting}>
							{isSubmitting ? (
								<span className="flex items-center gap-2">
									<span className="animate-spin material-symbols-outlined text-sm">
										progress_activity
									</span>
									<span>{t("common.status.saving")}</span>
								</span>
							) : (
								t("treasury.reimbursements.edit.save")
							)}
						</Button>
					</div>
				</Form>
			</div>
		</PageWrapper>
	);
}
