import { useEffect, useMemo, useState } from "react";
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
import { SectionCard } from "~/components/treasury/section-card";
import { LinkedItemInfo } from "~/components/treasury/linked-item-info";
import { Button } from "~/components/ui/button";
import { getDatabase } from "~/db";
import type {
	InventoryItem,
	NewInventoryItem,
	NewTransaction,
	Purchase,
	Transaction,
} from "~/db/schema";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { clearCache } from "~/lib/cache.server";
import { SITE_CONFIG } from "~/lib/config.server";
import {
	buildMinutesAttachment,
	buildReceiptAttachments,
	isEmailConfigured,
	sendReimbursementEmail,
} from "~/lib/email.server";
import { getReceiptsForPurchaseEdit } from "~/lib/receipts";
import {
	getMissingReceiptsError,
	MISSING_RECEIPTS_ERROR,
	parseReceiptLinks,
	RECEIPTS_SECTION_ID,
} from "~/lib/treasury/receipt-validation";
import { getMinutesByYear } from "~/lib/google.server";
import { getRelationshipContext } from "~/lib/linking/relationship-context.server";
import { RelationshipContextStatus } from "~/components/treasury/relationship-context-status";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";
import type { AnyEntity } from "~/lib/entity-converters";
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

export interface MinuteFile {
	id: string;
	name: string;
	url?: string;
	year: string;
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const db = getDatabase();

	const purchase = await db.getPurchaseById(params.purchaseId);

	if (!purchase) {
		throw new Response("Not Found", { status: 404 });
	}

	// Redirect if reimbursement has been sent (locked)
	if (purchase.emailSent) {
		throw redirect(`/treasury/reimbursements/${params.purchaseId}`);
	}

	// Check permission with self-edit support
	await requirePermissionOrSelf(
		request,
		"treasury:reimbursements:update",
		"treasury:reimbursements:update-self",
		purchase.createdBy,
		getDatabase,
	);

	// Get linked transaction via entity relationships
	let linkedTransaction = null;
	if (purchase.id) {
		const txRelationships = await db.getEntityRelationships("reimbursement", purchase.id);
		const txRel = txRelationships.find(r => r.relationBType === "transaction" || r.relationAType === "transaction");
		if (txRel) {
			const txId = txRel.relationBType === "transaction" ? txRel.relationBId : txRel.relationId;
			linkedTransaction = await db.getTransactionById(txId);
		}
	}

	// Get receipts for picker (unconnected + linked to this purchase)
	const receiptsByYear = await getReceiptsForPurchaseEdit(params.purchaseId);
	const currentYear = new Date().getFullYear();

	// Get active inventory items for picker
	const pickerItems = await db.getActiveInventoryItems();

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

	// Get all expense transactions for linking selector
	const allTransactions = await db.getAllTransactions();
	const expenseTransactions = allTransactions.filter(t => t.type === "expense");

	// Get all reimbursements to find which transactions are already linked
	const allPurchases = await db.getPurchases();
	const linkedTxIds = new Set<string>();
	for (const p of allPurchases) {
		if (p.id === purchase.id) continue; // Skip current purchase
		const rels = await db.getEntityRelationships("reimbursement", p.id);
		const txRel = rels.find(r => r.relationBType === "transaction" || r.relationAType === "transaction");
		if (txRel) {
			linkedTxIds.add(txRel.relationBType === "transaction" ? txRel.relationBId : txRel.relationId);
		}
	}

	// Filter to unlinked transactions
	const unlinkedTransactions = expenseTransactions.filter(t => !linkedTxIds.has(t.id));

	// Add current linked transaction to the list so it appears as selected option
	if (linkedTransaction && !unlinkedTransactions.find((t) => t.id === linkedTransaction.id)) {
		unlinkedTransactions.unshift(linkedTransaction);
	}

	// Fetch minutes from Google Drive
	let recentMinutes: MinuteFile[] = [];
	try {
		const minutesByYear = await getMinutesByYear();
		recentMinutes = minutesByYear
			.flatMap((year) =>
				year.files.map((file) => ({
					id: file.id,
					name: file.name,
					url: file.url,
					year: year.year,
				})),
			)
			.slice(0, 50); // Limit to recent 50 minutes
	} catch (error) {
		console.error("Failed to fetch minutes:", error);
	}

	// Get linked receipts via entity relationships
	const receiptRelationships = await db.getEntityRelationships("reimbursement", params.purchaseId);
	const linkedReceiptIds = receiptRelationships
		.filter(r => r.relationBType === "receipt" || r.relationAType === "receipt")
		.map(r => r.relationBType === "receipt" ? r.relationBId : r.relationId);
	const linkedReceipts = linkedReceiptIds.length > 0 
		? await Promise.all(linkedReceiptIds.map(id => db.getReceiptById(id))).then(receipts => receipts.filter((r): r is NonNullable<typeof r> => r !== null))
		: [];

	// Get OCR content for receipts
	const receiptIds = linkedReceipts.map(r => r.id);
	const receiptContents = receiptIds.length > 0 ? await db.getReceiptContentsByReceiptIds(receiptIds) : [];

	// Load relationships using new universal system
	const relationships = await loadRelationshipsForEntity(
		db,
		"reimbursement",
		params.purchaseId,
		["transaction", "receipt", "inventory"],
	);

	return {
		siteConfig: SITE_CONFIG,
		purchase,
		linkedTransaction,
		currentYear,
		recentMinutes,
		emailConfigured: await isEmailConfigured(),
		receiptsByYear,
		linkedReceipts,
		receiptContents,
		// Inventory picker data
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		// Unlinked transactions for linking selector
		unlinkedTransactions,
		relationshipContext: await getRelationshipContext(db, "reimbursement", purchase.id),
		relationships,
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

	// Block edits to sent reimbursements
	if (purchase.emailSent) {
		return { success: false, error: "Cannot edit a sent reimbursement" };
	}

	const year = purchase.year;

	// Check permission with self-edit support
	const user = await requirePermissionOrSelf(
		request,
		"treasury:reimbursements:update",
		"treasury:reimbursements:update-self",
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

	// Handle refreshReceipts action to clear cache
	if (actionType === "refreshReceipts") {
		clearCache("RECEIPTS_BY_YEAR");
		return { success: true };
	}

	// Handle sendRequest action
	if (actionType === "sendRequest") {
		const receiptLinks = parseReceiptLinks(formData);

		// Validate receipts
		const receiptError = getMissingReceiptsError(receiptLinks, true);
		if (receiptError) {
			return { success: false, error: receiptError, action: "sendRequest" };
		}

		const receiptAttachmentsPromise = buildReceiptAttachments(receiptLinks);
		const minutesAttachmentPromise = buildMinutesAttachment(
			purchase.minutesId,
			purchase.minutesName || undefined,
		);

		try {
			const [minutesAttachment, receiptAttachments] = await Promise.all([
				minutesAttachmentPromise,
				receiptAttachmentsPromise,
			]);

			const emailResult = await sendReimbursementEmail(
				{
					itemName: purchase.description || "Reimbursement request",
					itemValue: purchase.amount,
					purchaserName: purchase.purchaserName,
					bankAccount: purchase.bankAccount,
					minutesReference: purchase.minutesName || purchase.minutesId || "Ei määritetty / Not specified",
					notes: purchase.notes || undefined,
					receiptLinks: receiptLinks.length > 0 ? receiptLinks : undefined,
				},
				purchase.id,
				minutesAttachment || undefined,
				receiptAttachments,
				db,
			);

			if (emailResult.success) {
				await db.updatePurchase(purchase.id, {
					emailSent: true,
					emailMessageId: emailResult.messageId,
					emailError: null,
				});
				return { success: true, message: "treasury.reimbursements.email_sent_success" };
			} else {
				await db.updatePurchase(purchase.id, {
					emailError: emailResult.error || "Email sending failed",
				});
				return { success: false, error: emailResult.error || "Email sending failed" };
			}
		} catch (error) {
			console.error("[Reimbursement Edit] Email error:", error);
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			await db.updatePurchase(purchase.id, {
				emailError: errorMessage,
			});
			return { success: false, error: errorMessage };
		}
	}

	// Guard: if actionType was set but not handled above
	if (actionType) {
		console.warn(`[Action] Unhandled action type: ${actionType}`);
		return { success: false, error: `Unhandled action type: ${actionType}` };
	}

	// Handle update action (default)
	const linkTransactionId = formData.get("linkTransactionId") as string;
	const isLinkingToExisting = !!linkTransactionId;
	const createTransaction = formData.get("createTransaction") === "on";
	const txRelationships = await db.getEntityRelationships("reimbursement", params.purchaseId);
	const currentTxRel = txRelationships.find(r => r.relationBType === "transaction" || r.relationAType === "transaction");
	const currentLinkedTransaction = currentTxRel 
		? await db.getTransactionById(currentTxRel.relationBType === "transaction" ? currentTxRel.relationBId : currentTxRel.relationId)
		: null;

	const purchaserName = formData.get("purchaserName") as string;
	const bankAccount = formData.get("bankAccount") as string;
	const minutesInfo = formData.get("minutesId") as string; // value is "id|name" or just "id"
	const [minutesId, minutesName] = minutesInfo.includes("|")
		? minutesInfo.split("|")
		: [minutesInfo, ""];

	const notes = formData.get("notes") as string;

	// Get amount/description which might be edited if no transaction linked
	const amount = formData.get("amount") as string;
	const description = formData.get("description") as string;

	// Parse receipt links
	const receiptLinks = parseReceiptLinks(formData);

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
		if (currentLinkedTransaction && currentTxRel) {
			await db.deleteEntityRelationship(currentTxRel.id);
			await db.updateTransaction(currentLinkedTransaction.id, {
				reimbursementStatus: "not_requested",
			});
		}

		// Link new transaction via entity relationship
		await db.createEntityRelationship({
			relationAType: "reimbursement",
			relationId: params.purchaseId,
			relationBType: "transaction",
			relationBId: linkTransactionId,
		});
		await db.updateTransaction(linkTransactionId, {
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
	} else if (!isLinkingToExisting && currentLinkedTransaction) {
		// Unlink logic: if we had a linked transaction but now we don't (user cleared it)
		// NOTE: The UI I'm building uses RelationActions which handles unlinking via separate nav stack logic usually,
		// but here we might just want to support form submission updating the link.
		// However, for consistency with other forms, maybe we should just handle updates to the purchase fields.
		// If user wants to UNLINK, they should probably go to the transaction edit page?
		// Actually, let's keep it simple: we only update the Purchase fields here. 
		// Linking/Unlinking transactions is best done via the separate flow, 
		// BUT standard form behavior expects "if I change the dropdown, it updates".
		// The new pattern says "Link Existing" dropdown in edit mode.

		// If I select a transaction in the dropdown, updates the link. 
		// If I select "None" (empty string), it unlinks.

		if (!linkTransactionId && currentTxRel) {
			await db.deleteEntityRelationship(currentTxRel.id);
			await db.updateTransaction(currentLinkedTransaction.id, {
				reimbursementStatus: "not_requested",
			});
			// Update purchase with submitted values
			await db.updatePurchase(params.purchaseId, {
				purchaserName,
				bankAccount,
				minutesId,
				minutesName: minutesName || null,
				notes: notes || null,
				amount,
				description,
			});
		}
	} else {
		// Update purchase only (no transaction changes)
		// When a linked transaction exists, derive amount/description from it
		const derivedAmount = currentLinkedTransaction ? currentLinkedTransaction.amount.toString() : amount;
		const derivedDescription = currentLinkedTransaction ? currentLinkedTransaction.description : description;

		await db.updatePurchase(params.purchaseId, {
			purchaserName,
			bankAccount,
			minutesId,
			minutesName: minutesName || null,
			notes: notes || null,
			amount: derivedAmount,
			description: derivedDescription,
		});
	}

	// Handle receipt linking/unlinking via entity relationships
	// Get existing receipt relationships
	const existingReceiptRels = await db.getEntityRelationships("reimbursement", params.purchaseId);
	const existingReceiptIds = new Set(
		existingReceiptRels
			.filter(r => r.relationBType === "receipt" || r.relationAType === "receipt")
			.map(r => r.relationBType === "receipt" ? r.relationBId : r.relationId)
	);
	const newReceiptPathnames = new Set(receiptLinks.map((rl) => rl.id));

	// Get all receipts to find by pathname
	const allReceipts = await db.getReceipts();

	// Build map of pathname to receipt
	const pathnameToReceipt = new Map(allReceipts.map(r => [r.pathname, r]));

	// Find new receipt IDs to link
	const newReceiptIds = new Set<string>();
	for (const receiptLink of receiptLinks) {
		const pathname = receiptLink.id;
		const existingReceipt = pathnameToReceipt.get(pathname);
		if (existingReceipt) {
			newReceiptIds.add(existingReceipt.id);
		}
	}

	// Unlink receipts that are no longer selected
	for (const existingRel of existingReceiptRels) {
		if (existingRel.relationBType === "receipt" || existingRel.relationAType === "receipt") {
			const receiptId = existingRel.relationBType === "receipt" ? existingRel.relationBId : existingRel.relationId;
			if (!newReceiptIds.has(receiptId)) {
				await db.deleteEntityRelationship(existingRel.id);
			}
		}
	}

	// Link new receipts
	for (const receiptId of newReceiptIds) {
		if (!existingReceiptIds.has(receiptId)) {
			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: params.purchaseId,
				relationBType: "receipt",
				relationBId: receiptId,
			});
		}
	}

	// Create new receipts that don't exist yet
	for (const receiptLink of receiptLinks) {
		const pathname = receiptLink.id;
		if (!pathnameToReceipt.has(pathname)) {
			// Create new receipt record
			const newReceipt = await db.createReceipt({
				name: receiptLink.name || null,
				description: null,
				url: receiptLink.url,
				pathname,
				createdBy: user?.userId || null,
			});
			// Link the new receipt
			await db.createEntityRelationship({
				relationAType: "reimbursement",
				relationId: params.purchaseId,
				relationBType: "receipt",
				relationBId: newReceipt.id,
			});
		}
	}

	// Save relationships using new universal system
	await saveRelationshipChanges(db, "reimbursement", params.purchaseId, formData, user?.userId || null);

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
		pickerItems,
		uniqueLocations,
		uniqueCategories,
		unlinkedTransactions,
		linkedReceipts,
		receiptContents: receiptContentsData,
		relationshipContext,
		relationships,
	} = loaderData;
	const navigate = useNavigate();
	const fetcher = useFetcher();
	const actionData = useActionData<typeof action>();
	const { t } = useTranslation();

	const navigation = useNavigation();
	const isSubmitting =
		navigation.state === "submitting" || fetcher.state === "submitting";

	// Form state
	const [description, setDescription] = useState(purchase.description || "");
	const [amount, setAmount] = useState(purchase.amount);
	const [purchaserName, setPurchaserName] = useState(purchase.purchaserName || "");
	const [bankAccount, setBankAccount] = useState(purchase.bankAccount || "");
	const [minutesId, setMinutesId] = useState(purchase.minutesId || "");
	const [notes, setNotes] = useState(purchase.notes || "");

	// Use relationship picker hook
	const relationshipPicker = useRelationshipPicker({
		relationAType: "reimbursement",
		relationAId: purchase.id,
		initialRelationships: [],
	});

	// Receipt state (filter out drafts - receipts without pathname/url)
	const [selectedReceipts, setSelectedReceipts] = useState<{ id: string; name: string; url: string }[]>(
		linkedReceipts
			.filter((r) => r.pathname && r.url)
			.map((r) => ({
				id: r.pathname!,
				name: r.name || r.pathname!.split("/").pop() || "Receipt",
				url: r.url!,
			})),
	);
	const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);

	// Receipt upload handler
	const handleUploadReceipt = async (
		file: File,
		year: string,
		desc: string,
		ocrEnabled = false,
	): Promise<{ id: string; name: string; url: string } | null> => {
		setIsUploadingReceipt(true);
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
		} finally {
			setIsUploadingReceipt(false);
		}
	};

	// Sync amount/description from linked transaction
	useEffect(() => {
		if (linkedTransaction) {
			setAmount(linkedTransaction.amount);
			setDescription(linkedTransaction.description || "");
		}
	}, [linkedTransaction]);

	// Toast for email sending
	useEffect(() => {
		if (actionData?.success) {
			if (actionData.message) {
				toast.success(t(actionData.message));
			}
		} else if (actionData?.error) {
			toast.error(typeof actionData.error === "string" ? actionData.error : "Error");
		}
	}, [actionData, t]);

	// Check if form is dirty
	const isDirty = useMemo(() => {
		const initialDescription = purchase.description || "";
		const initialAmount = purchase.amount;
		const initialPurchaserName = purchase.purchaserName || "";
		const initialBankAccount = purchase.bankAccount || "";
		const initialMinutesId = purchase.minutesId || "";
		const initialNotes = purchase.notes || "";

		const initialReceiptIds = new Set(linkedReceipts.map((r) => r.pathname).filter(Boolean));
		const currentReceiptIds = new Set(selectedReceipts.map((r) => r.id));

		const areReceiptsDifferent =
			initialReceiptIds.size !== currentReceiptIds.size ||
			[...currentReceiptIds].some((id) => !initialReceiptIds.has(id));

		return (
			description !== initialDescription ||
			amount !== initialAmount ||
			purchaserName !== initialPurchaserName ||
			bankAccount !== initialBankAccount ||
			minutesId !== initialMinutesId ||
			notes !== initialNotes ||
			areReceiptsDifferent
		);
	}, [
		purchase,
		linkedReceipts,
		description,
		amount,
		purchaserName,
		bankAccount,
		minutesId,
		notes,
		selectedReceipts,
	]);

	const canSendRequest =
		purchase.purchaserName &&
		purchase.bankAccount &&
		purchase.minutesId &&
		selectedReceipts.length > 0;

	// Build receipt subtitles from OCR data (keyed by pathname since ReceiptsPicker uses pathname as ID)
	const receiptSubtitles: Record<string, string> = {};
	if (receiptContentsData) {
		for (const rc of receiptContentsData) {
			const receipt = linkedReceipts.find((r: { id: string }) => r.id === rc.receiptId);
			if (receipt && receipt.pathname) {
				const parts = [rc.storeName, rc.totalAmount ? `${rc.totalAmount} ${rc.currency || 'EUR'}` : null].filter(Boolean);
				if (parts.length > 0) receiptSubtitles[receipt.pathname] = parts.join(' \u2022 ');
			}
		}
	}

	// Current path for navigation stack
	const currentPath = `/treasury/reimbursements/${purchase.id}/edit`;

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader title={t("treasury.reimbursements.edit.title")} />

				<Form method="post" className="space-y-6">
					<input type="hidden" name="receiptLinks" value={JSON.stringify(selectedReceipts)} />

					{/* Reimbursement Details */}
					<TreasuryDetailCard title={t("treasury.reimbursements.edit.reimbursement_details")}>
						<div className="grid gap-4">
							<TreasuryField
								mode="edit"
								label={`${t("treasury.new_reimbursement.description")} *`}
								name="description"
								type="text"
								value={description}
								onChange={setDescription}
								required
								placeholder={t("treasury.new_reimbursement.description_placeholder")}
								disabled={!!linkedTransaction}
							/>
							<TreasuryField
								mode="edit"
								label={`${t("treasury.new_reimbursement.amount")} *`}
								name="amount"
								type="currency"
								value={amount}
								onChange={setAmount}
								required
								disabled={!!linkedTransaction}
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

						{/* Relationships Section */}
						<RelationshipPicker
							relationAType="reimbursement"
							relationAId={purchase.id}
							relationAName={purchase.description || ""}
							mode="edit"
							currentPath={currentPath}
							showAnalyzeButton={true}
							sections={[
								{
									relationBType: "transaction",
									linkedEntities: ((relationships.transaction?.linked || []) as unknown) as AnyEntity[],
									availableEntities: ((relationships.transaction?.available || []) as unknown) as AnyEntity[],
									maxItems: 1,
									createType: "transaction",
									label: t("treasury.transactions.title"),
								},
								{
									relationBType: "receipt",
									linkedEntities: ((relationships.receipt?.linked || []) as unknown) as AnyEntity[],
									availableEntities: ((relationships.receipt?.available || []) as unknown) as AnyEntity[],
									createType: "receipt",
									label: t("treasury.receipts.title"),
								},
								{
									relationBType: "inventory",
									linkedEntities: ((relationships.inventory?.linked || []) as unknown) as AnyEntity[],
									availableEntities: ((relationships.inventory?.available || []) as unknown) as AnyEntity[],
									createType: "inventory",
									label: t("treasury.inventory.title"),
								},
							]}
							onLink={relationshipPicker.handleLink}
							onUnlink={relationshipPicker.handleUnlink}
							formData={relationshipPicker.toFormData()}
							onAnalyzeComplete={(result) => {
								if (result.success) {
									toast.success(t("relationships.ai.success", { count: result.createdCount }));
								} else {
									toast.error(t("relationships.ai.error"));
								}
							}}
						/>

						<RelationshipContextStatus
							context={relationshipContext}
							entityType="reimbursement"
							entityId={purchase.id}
							currentEntityValue={{
								amount: Number(purchase.amount),
								description: purchase.description
							}}
						/>
					</TreasuryDetailCard>


					<TreasuryFormActions
						isSubmitting={isSubmitting}
						disabled={!isDirty}
						extraActions={
							canSendRequest ? (
								<Button
									type="submit"
									name="_action"
									value="sendRequest"
									variant="secondary"
									disabled={isSubmitting || !!purchase.emailSent}
									className="flex-1"
								>
									<span className="material-symbols-outlined mr-2 text-sm">
										send
									</span>
									{purchase.emailSent
										? t("treasury.reimbursements.email_sent")
										: t("treasury.reimbursements.send_request")}
								</Button>
							) : null
						}
					/>
				</Form>
			</div>
		</PageWrapper>
	);
}
