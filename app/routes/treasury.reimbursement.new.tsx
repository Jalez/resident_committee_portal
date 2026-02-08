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
	TreasuryDetailCard,
	TreasuryField,
} from "~/components/treasury/treasury-detail-components";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { TreasuryRelationActions } from "~/components/treasury/treasury-relation-actions";
import { ReceiptsPicker, type ReceiptLink } from "~/components/treasury/pickers/receipts-picker";
import { MinutesPicker } from "~/components/treasury/pickers/minutes-picker";
import { TransactionsPicker } from "~/components/treasury/pickers/transactions-picker";
import { useNewTransaction } from "~/contexts/new-transaction-context";
import { useReimbursementTemplate } from "~/contexts/reimbursement-template-context";
import {
	getDatabase,
	type InventoryItem,
	type NewInventoryItem,
	type NewPurchase,
	type Transaction,
} from "~/db";
import { requireAnyPermission } from "~/lib/auth.server";
import { clearCache } from "~/lib/cache.server";
import { SITE_CONFIG } from "~/lib/config.server";
import {
	buildMinutesAttachment,
	buildReceiptAttachments,
	isEmailConfigured,
	sendReimbursementEmail,
} from "~/lib/email.server";
import { getUnconnectedReceiptsByYear } from "~/lib/receipts";
import {
	getMissingReceiptsError,
	MISSING_RECEIPTS_ERROR,
	parseReceiptLinks,
	RECEIPTS_SECTION_ID,
} from "~/lib/treasury/receipt-validation";
import { getSourceContextFromUrl } from "~/lib/linking/source-context";

import type { Route } from "./+types/treasury.reimbursement.new";

export function meta({ data }: Route.MetaArgs) {
	return [
		{
			title: `${data?.siteConfig?.name || "Portal"} - Uusi kulukorvaus / New Reimbursement`,
		},
		{ name: "robots", content: "noindex" },
	];
}

export interface MinuteFile {
	id: string;
	name: string;
	url?: string;
	year: string;
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireAnyPermission(request, ["treasury:reimbursements:create", "treasury:reimbursements:create-self", "treasury:reimbursements:write"], getDatabase);
	const db = getDatabase();

	const url = new URL(request.url);

	// Parse universal source context (supports both new and legacy formats)
	const sourceContext = getSourceContextFromUrl(url);

	// Get receipts for picker (only unconnected)
	const receiptsByYear = await getUnconnectedReceiptsByYear();
	const currentYear = new Date().getFullYear();

	// Check if we should prefill from source context
	let prefillData = null;
	let sourceReceipt = null;
	let sourceTransaction = null;

	if (sourceContext) {
		try {
			switch (sourceContext.type) {
				case "receipt":
					// Existing receipt logic - fetch receipt and OCR content
					const receipt = await db.getReceiptById(sourceContext.id);
					if (receipt) {
						sourceReceipt = receipt;
						const receiptContent = await db.getReceiptContentByReceiptId(sourceContext.id);
						if (receiptContent) {
							prefillData = {
								amount: receiptContent.totalAmount ? String(receiptContent.totalAmount) : "",
								description: receiptContent.storeName
									? `${receiptContent.storeName} - ${new Date(receiptContent.purchaseDate || receipt.createdAt).toLocaleDateString()}`
									: receipt.description || "",
								linkedReceiptIds: [receipt.id],
								sourceType: "receipt",
								sourceName: sourceContext.name || receipt.name || receipt.pathname.split("/").pop() || "Receipt",
							};
						}
					}
					break;

				case "transaction":
					// New transaction logic - pre-fill from transaction
					sourceTransaction = await db.getTransactionById(sourceContext.id);
					if (sourceTransaction) {
						prefillData = {
							amount: String(Math.abs(parseFloat(sourceTransaction.amount))), // Use absolute value for expenses
							description: sourceTransaction.description,
							linkedTransactionId: sourceTransaction.id,
							sourceType: "transaction",
							sourceName: sourceContext.name || sourceTransaction.description,
						};
					}
					break;
			}
		} catch (error) {
			console.error("Error loading source context:", error);
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

	// Get transactions without reimbursements (for linking selector)
	const unlinkedTransactions =
		await db.getExpenseTransactionsWithoutReimbursement();

	// Fetch minutes from DB
	let recentMinutes: MinuteFile[] = [];
	try {
		const minutes = await db.getMinutes(); // Fetch all or limit? getMinutes might need limit/year
		// Sort by date desc
		minutes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

		recentMinutes = minutes.slice(0, 50).map(m => ({
			id: m.id,
			name: m.title,
			url: m.fileUrl,
			year: new Date(m.date).getFullYear().toString()
		}));
	} catch (error) {
		console.error("Failed to fetch minutes:", error);
	}

	return {
		siteConfig: SITE_CONFIG,
		recentMinutes,
		emailConfigured: await isEmailConfigured(),
		currentYear,
		receiptsByYear,
		// Inventory picker data
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		// Unlinked transactions for linking selector
		unlinkedTransactions,
		// Prefill data from source context
		prefillData,
		sourceReceipt,
		sourceTransaction,
		sourceContext,
	};
}

export async function action({ request }: Route.ActionArgs) {
	const user = await requireAnyPermission(request, ["treasury:reimbursements:create", "treasury:reimbursements:create-self", "treasury:reimbursements:write"], getDatabase);
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

	// Main form submission
	const linkTransactionId = formData.get("linkTransactionId") as string;
	const isLinkingToExisting = !!linkTransactionId;

	const purchaserName = formData.get("purchaserName") as string;
	const bankAccount = formData.get("bankAccount") as string;

	const minutesInfo = formData.get("minutesId") as string;
	const [minutesId, minutesName] = minutesInfo.includes("|")
		? minutesInfo.split("|")
		: [minutesInfo, ""];

	const notes = formData.get("notes") as string;
	const currentYear = new Date().getFullYear();

	const receiptLinks = parseReceiptLinks(formData);
	const receiptError = getMissingReceiptsError(receiptLinks, true);
	if (receiptError) {
		return { success: false, error: receiptError };
	}

	let description: string;
	let amount: string;
	let year = currentYear;

	if (isLinkingToExisting) {
		// Link to existing transaction
		const existingTransaction = (await db.getAllTransactions()).find(
			(t) => t.id === linkTransactionId,
		);
		if (!existingTransaction) {
			return { success: false, error: "Transaction not found" };
		}

		description = existingTransaction.description;
		amount = existingTransaction.amount;
		year = existingTransaction.year;

		// Create purchase (reimbursement request) and link to existing transaction
		const newPurchase: NewPurchase = {
			description,
			amount,
			purchaserName,
			bankAccount,
			minutesId,
			minutesName,
			notes: notes || null,
			status: "pending",
			year,
			emailSent: false,
			createdBy: user.userId,
		};

		const purchase = await db.createPurchase(newPurchase);

		// Update existing transaction to link to purchase
		await db.updateTransaction(existingTransaction.id, {
			purchaseId: purchase.id,
			status: "pending",
			reimbursementStatus: "requested",
		});

		// Create receipt records for linked receipts
		if (receiptLinks.length > 0) {
			for (const receiptLink of receiptLinks) {
				// Extract pathname from receipt link (id is the pathname)
				const pathname = receiptLink.id;
				// Check if receipt already exists in database
				const existingReceipts = await db.getReceipts();
				const existingReceipt = existingReceipts.find((r) => r.pathname === pathname);

				if (existingReceipt) {
					// Update existing receipt to link to purchase
					await db.updateReceipt(existingReceipt.id, {
						purchaseId: purchase.id,
					});
				} else {
					// Create new receipt record
					await db.createReceipt({
						name: receiptLink.name || null,
						description: null,
						url: receiptLink.url,
						pathname,
						purchaseId: purchase.id,
						createdBy: user.userId,
					});
				}
			}
		}

		// Send email
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
						minutesReference: minutesName || minutesId,
						notes,
						receiptLinks: receiptLinks.length > 0 ? receiptLinks : undefined,
					},
					purchase.id,
					minutesAttachment || undefined,
					receiptAttachments,
					db,
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
						emailError: emailResult.error || "Email sending failed",
					});
				}
			})
			.catch(async (error) => {
				console.error("[Reimbursement] Email error:", error);
				await db.updatePurchase(purchase.id, {
					emailError: error instanceof Error ? error.message : "Unknown error",
				});
			});
		await emailTask;
	} else {
		// Create purchase only (no transaction)
		description = formData.get("description") as string;
		amount = formData.get("amount") as string;

		// Create purchase (reimbursement request) without linked transaction
		const newPurchase: NewPurchase = {
			description,
			amount,
			purchaserName,
			bankAccount,
			minutesId,
			minutesName,
			notes: notes || null,
			status: "pending",
			year: currentYear,
			emailSent: false,
			createdBy: user.userId,
		};

		const purchase = await db.createPurchase(newPurchase);

		// Link minute if selected (and is UUID)
		if (minutesId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(minutesId)) {
			await db.createMinuteLink({
				minuteId: minutesId,
				purchaseId: purchase.id,
			});
		}

		// Send email
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
						itemName: newPurchase.description || `${purchaserName}`,
						itemValue: newPurchase.amount,
						purchaserName,
						bankAccount,
						minutesReference: minutesName || minutesId,
						notes,
						receiptLinks: receiptLinks.length > 0 ? receiptLinks : undefined,
					},
					purchase.id,
					minutesAttachment || undefined,
					receiptAttachments,
					db,
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
						emailError: emailResult.error || "Email sending failed",
					});
				}
			})
			.catch(async (error) => {
				console.error("[Reimbursement] Email error:", error);
				await db.updatePurchase(purchase.id, {
					emailError: error instanceof Error ? error.message : "Unknown error",
				});
			});
		await emailTask;
	}

	return redirect("/treasury/reimbursements?success=reimbursement_requested");
}

export default function NewReimbursement({ loaderData }: Route.ComponentProps) {
	const {
		recentMinutes,
		emailConfigured,
		currentYear,
		receiptsByYear,
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		unlinkedTransactions,
		prefillData,
		sourceReceipt,
		sourceTransaction,
		sourceContext,
	} = loaderData;
	const navigate = useNavigate();
	const fetcher = useFetcher();
	const actionData = useActionData<typeof action>();
	const { t } = useTranslation();
	const { template, clearTemplate, isHydrated } = useReimbursementTemplate();

	const navigation = useNavigation();
	const isSubmitting =
		navigation.state === "submitting" || fetcher.state === "submitting";

	// Link to existing transaction state
	const [selectedTransactionId, setSelectedTransactionId] = useState("");
	const isLinkingToExisting = !!selectedTransactionId;

	// Get items from context (set by inventory page)
	const { items: contextItems, setItems } = useNewTransaction();

	// Transaction details state
	const [amount, setAmount] = useState("");
	const [description, setDescription] = useState("");
	const [year, setYear] = useState(currentYear);

	// Reimbursement template pre-fill state (for purchaser info)
	const [purchaserName, setPurchaserName] = useState("");
	const [bankAccount, setBankAccount] = useState("");
	const [notes, setNotes] = useState("");
	const [minutesId, setMinutesId] = useState("");

	// Receipt state
	const [selectedReceipts, setSelectedReceipts] = useState<ReceiptLink[]>([]);

	// Handler for receipt selection that auto-fills form
	const handleReceiptSelectionChange = async (receipts: ReceiptLink[]) => {
		setSelectedReceipts(receipts);

		// If a new receipt was added (not removed), try to auto-fill from it
		if (receipts.length > selectedReceipts.length) {
			const newReceipt = receipts[receipts.length - 1];
			try {
				// Fetch receipt data including OCR content
				const response = await fetch(`/api/receipts/${newReceipt.id}`);
				if (response.ok) {
					const data = await response.json();

					// Auto-fill from receipt content if available
					if (data.receiptContent) {
						const content = data.receiptContent;

						// Set description from receipt description or store name
						const autoDescription = data.receipt.description ||
							(content.storeName ? `${content.storeName} - ${new Date(content.purchaseDate || data.receipt.createdAt).toLocaleDateString()}` : "");
						if (autoDescription && !description) {
							setDescription(autoDescription);
						}

						// Set amount from total
						if (content.totalAmount && !amount) {
							setAmount(String(content.totalAmount));
						}
					}
				}
			} catch (error) {
				console.error("[handleReceiptSelectionChange] Failed to fetch receipt data:", error);
			}
		}
	};

	// Update form values when a transaction is selected for linking
	useEffect(() => {
		if (selectedTransactionId) {
			const transaction = unlinkedTransactions.find(
				(t) => t.id === selectedTransactionId,
			);
			if (transaction) {
				setAmount(transaction.amount);
				setDescription(transaction.description);
				setYear(transaction.year);
			}
		}
	}, [selectedTransactionId, unlinkedTransactions]);

	useEffect(() => {
		if (actionData && "error" in actionData && actionData.error) {
			toast.error(
				typeof actionData.error === "string"
					? actionData.error
					: t("treasury.new_reimbursement.error"),
			);
			if (actionData.error === MISSING_RECEIPTS_ERROR) {
				const receiptsSection = document.getElementById(RECEIPTS_SECTION_ID);
				receiptsSection?.focus();
				receiptsSection?.scrollIntoView({ behavior: "smooth", block: "center" });
			}
		}
	}, [actionData, t]);

	// Pre-fill from template after hydration
	useEffect(() => {
		if (isHydrated && template) {
			setDescription(template.description);
			setAmount(template.amount);
			setPurchaserName(template.purchaserName);
			setBankAccount(template.bankAccount);
			setNotes(template.notes || "");
			clearTemplate();
		}
	}, [isHydrated, template, clearTemplate]);

	// Pre-fill from source context (receipt or transaction)
	useEffect(() => {
		if (!prefillData) return;

		setAmount(prefillData.amount);
		setDescription(prefillData.description);

		if (prefillData.sourceType === "receipt" && sourceReceipt) {
			// Add the receipt to selected receipts
			const receiptLink: ReceiptLink = {
				id: sourceReceipt.id,
				name: sourceReceipt.name || sourceReceipt.pathname.split("/").pop() || "Receipt",
				url: sourceReceipt.url,
			};
			setSelectedReceipts([receiptLink]);
		} else if (prefillData.sourceType === "transaction" && sourceTransaction) {
			// Pre-select the transaction
			setSelectedTransactionId(sourceTransaction.id);
		}
	}, [prefillData, sourceReceipt, sourceTransaction]);

	// Sync amount with inventory items total when quantities change
	useEffect(() => {
		if (contextItems.length > 0 && !isLinkingToExisting) {
			const total = contextItems.reduce(
				(sum, item) => sum + item.quantity * item.unitValue,
				0,
			);
			if (total > 0) {
				setAmount(total.toFixed(2));
			}
		}
	}, [contextItems, isLinkingToExisting]);

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



	// Find selected transaction for display
	const selectedTransaction = selectedTransactionId
		? unlinkedTransactions.find((t) => t.id === selectedTransactionId)
		: null;

	// Receipt upload handler
	const handleUploadReceipt = async (
		file: File,
		year: string,
		desc: string,
		ocrEnabled = false,
	): Promise<ReceiptLink | null> => {
		try {
			const formData = new FormData();
			formData.append("file", file);
			formData.append("year", year);
			formData.append("description", desc || "kuitti");
			formData.append("ocr_enabled", String(ocrEnabled));

			const response = await fetch("/api/receipts/upload", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				throw new Error("Upload failed");
			}

			const data = await response.json();
			toast.success(t("treasury.new_reimbursement.receipt_uploaded"));
			return {
				id: data.pathname,
				name: data.pathname.split("/").pop() || file.name,
				url: data.url,
			};
		} catch (error) {
			console.error("[uploadReceipt] Error:", error);
			toast.error(t("receipts.upload_failed"));
			return null;
		}
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		// Validate minutes is selected
		if (!minutesId) {
			e.preventDefault();
			toast.error(t("treasury.new_reimbursement.minutes_required", "Minutes document is required"));
			return;
		}
	};

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader title={t("treasury.new_reimbursement.title")} />

				<Form method="post" className="space-y-6" onSubmit={handleSubmit}>
					{/* Hidden fields */}
					<input
						type="hidden"
						name="linkTransactionId"
						value={selectedTransactionId}
					/>
					<input
						type="hidden"
						name="receiptLinks"
						value={JSON.stringify(selectedReceipts)}
					/>

					{/* Reimbursement Details */}
					<TreasuryDetailCard title={t("treasury.new_reimbursement.reimbursement_details")}>
						<div className="grid gap-4">
							{prefillData && (
								<div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-md dark:bg-blue-900/30 dark:text-blue-300">
									<span className="material-symbols-outlined text-base">link</span>
									{t("treasury.auto_linked_from", {
										type: t(`common.entity_types.${prefillData.sourceType}`),
										name: prefillData.sourceName,
									})}
								</div>
							)}
							<TreasuryField
								mode="edit"
								label={`${t("treasury.new_reimbursement.description")} *`}
								name="description"
								type="text"
								value={description}
								onChange={setDescription}
								required
								placeholder={t("treasury.new_reimbursement.description_placeholder")}
								disabled={!!prefillData}
							/>
							<TreasuryField
								mode="edit"
								label={`${t("treasury.new_reimbursement.amount")} *`}
								name="amount"
								type="currency"
								value={amount}
								onChange={setAmount}
								required
								disabled={!!prefillData}
							/>
							<TreasuryField
								mode="edit"
								label={`${t("treasury.new_reimbursement.purchaser_name")} *`}
								name="purchaserName"
								type="text"
								value={purchaserName}
								onChange={setPurchaserName}
								required
							/>
							<TreasuryField
								mode="edit"
								label={`${t("treasury.new_reimbursement.bank_account")} *`}
								name="bankAccount"
								type="text"
								value={bankAccount}
								onChange={setBankAccount}
								required
								placeholder="FI12 3456 7890 1234 56"
							/>
							{/* Hidden field for form submission */}
							<input type="hidden" name="minutesId" value={minutesId} />
							<TreasuryField
								mode="edit"
								label={t("treasury.new_reimbursement.notes")}
								name="notes"
								type="textarea"
								value={notes}
								onChange={setNotes}
							/>
						</div>

						{/* Minutes */}
						<MinutesPicker
							recentMinutes={recentMinutes}
							selectedMinutesId={minutesId}
							onSelectionChange={setMinutesId}
							currentPath="/treasury/reimbursements/new"
							storageKey="reimbursement-new-minutes"
						/>

						{/* Transaction Link */}
						<TransactionsPicker
							unlinkedTransactions={unlinkedTransactions as Transaction[]}
							selectedTransactionIds={selectedTransactionId}
							onSelectionChange={(ids) => setSelectedTransactionId(Array.isArray(ids) ? ids[0] : ids)}
							createUrl="/treasury/transactions/new"
							currentPath="/treasury/reimbursements/new"
							maxItems={1}
						/>

						{/* Receipts */}
						<ReceiptsPicker
							receiptsByYear={receiptsByYear}
							selectedReceipts={selectedReceipts}
							onSelectionChange={handleReceiptSelectionChange}
							onUpload={async (file) => {
								return handleUploadReceipt(
									file,
									currentYear.toString(),
									description || "kuitti",
									true,
								);
							}}
							currentPath="/treasury/reimbursements/new"
							storageKey="reimbursement-new-receipts"
						/>
					</TreasuryDetailCard>

					<TreasuryFormActions
						isSubmitting={isSubmitting}
						saveLabel={t("treasury.new_reimbursement.submit_request")}
					/>
				</Form>
			</div>
		</PageWrapper>
	);
}
