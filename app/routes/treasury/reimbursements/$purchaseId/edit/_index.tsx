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
import { PageHeader } from "~/components/layout/page-header";
import { PageWrapper } from "~/components/layout/page-layout";
import { RelationshipPicker } from "~/components/relationships/relationship-picker";
import { SmartAutofillButton } from "~/components/smart-autofill-button";
import { RelationshipContextStatus } from "~/components/treasury/relationship-context-status";
import {
	TreasuryDetailCard,
	TreasuryField,
} from "~/components/treasury/treasury-detail-components";
import { TreasuryFormActions } from "~/components/treasury/treasury-form-actions";
import { Button } from "~/components/ui/button";
import { getDatabase } from "~/db";
import { useRelationshipPicker } from "~/hooks/use-relationship-picker";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import { isEmailConfigured } from "~/lib/email.server";
import type { AnyEntity } from "~/lib/entity-converters";
import { getMinutesByYear } from "~/lib/google.server";
import { getRelationshipContextFromUrl } from "~/lib/linking/relationship-context";
import { getReceiptsForPurchaseEdit } from "~/lib/receipts";
import { loadRelationshipsForEntity } from "~/lib/relationships/load-relationships.server";
import { getRelationshipContext } from "~/lib/relationships/relationship-context.server";
import type { Route } from "./+types/_index";

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
		const txRelationships = await db.getEntityRelationships(
			"reimbursement",
			purchase.id,
		);
		const txRel = txRelationships.find(
			(r) =>
				r.relationBType === "transaction" || r.relationAType === "transaction",
		);
		if (txRel) {
			const txId =
				txRel.relationBType === "transaction"
					? txRel.relationBId
					: txRel.relationId;
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
	const expenseTransactions = allTransactions.filter(
		(t) => t.type === "expense",
	);

	// Get all reimbursements to find which transactions are already linked
	const allPurchases = await db.getPurchases();
	const linkedTxIds = new Set<string>();
	for (const p of allPurchases) {
		if (p.id === purchase.id) continue; // Skip current purchase
		const rels = await db.getEntityRelationships("reimbursement", p.id);
		const txRel = rels.find(
			(r) =>
				r.relationBType === "transaction" || r.relationAType === "transaction",
		);
		if (txRel) {
			linkedTxIds.add(
				txRel.relationBType === "transaction"
					? txRel.relationBId
					: txRel.relationId,
			);
		}
	}

	// Filter to unlinked transactions
	const unlinkedTransactions = expenseTransactions.filter(
		(t) => !linkedTxIds.has(t.id),
	);

	// Add current linked transaction to the list so it appears as selected option
	if (
		linkedTransaction &&
		!unlinkedTransactions.find((t) => t.id === linkedTransaction.id)
	) {
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
	const receiptRelationships = await db.getEntityRelationships(
		"reimbursement",
		params.purchaseId,
	);
	const linkedReceiptIds = receiptRelationships
		.filter(
			(r) => r.relationBType === "receipt" || r.relationAType === "receipt",
		)
		.map((r) => (r.relationBType === "receipt" ? r.relationBId : r.relationId));
	const linkedReceipts =
		linkedReceiptIds.length > 0
			? await Promise.all(
					linkedReceiptIds.map((id) => db.getReceiptById(id)),
				).then((receipts) =>
					receipts.filter((r): r is NonNullable<typeof r> => r !== null),
				)
			: [];

	// Get OCR content for receipts
	const receiptIds = linkedReceipts.map((r) => r.id);
	const receiptContents =
		receiptIds.length > 0
			? await db.getReceiptContentsByReceiptIds(receiptIds)
			: [];

	// Load relationships using new universal system
	const relationships = await loadRelationshipsForEntity(
		db,
		"reimbursement",
		params.purchaseId,
		["transaction", "receipt", "inventory"],
	);

	// Get source context from URL (for auto-linking when created from picker)
	const url = new URL(request.url);
	const sourceContext = getRelationshipContextFromUrl(url);
	const returnUrl = url.searchParams.get("returnUrl");

	// Get relationship context values for autofill (uses domination scale)
	const contextValues = await getRelationshipContext(
		db,
		"reimbursement",
		purchase.id,
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
		contextValues,
		relationships,
		sourceContext,
		returnUrl,
	};
}

export async function action() {
	// Reimbursement update logic has been moved to /api/reimbursements/:reimbursementId/update
	return null;
}

export default function EditReimbursement({
	loaderData,
}: Route.ComponentProps) {
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
		contextValues,
		relationships,
		sourceContext,
		returnUrl,
	} = loaderData;
	const navigate = useNavigate();
	const fetcher = useFetcher();
	const actionData = useActionData<any>();
	const { t } = useTranslation();

	const navigation = useNavigation();
	const isSubmitting =
		navigation.state === "submitting" || fetcher.state === "submitting";

	// Pre-populate from relationship context if reimbursement is a draft with defaults
	const initialDescription =
		purchase.status === "draft" &&
		(!purchase.description || purchase.description === "") &&
		contextValues?.description
			? contextValues.description
			: purchase.description || "";
	const initialAmount =
		purchase.status === "draft" &&
		Number.parseFloat(purchase.amount) === 0 &&
		contextValues?.totalAmount
			? contextValues.totalAmount.toFixed(2)
			: purchase.amount;

	// Form state
	const [description, setDescription] = useState(initialDescription);
	const [amount, setAmount] = useState(initialAmount);
	const [purchaserName, setPurchaserName] = useState(
		purchase.purchaserName || "",
	);
	const [bankAccount, setBankAccount] = useState(purchase.bankAccount || "");
	const [minutesId, _setMinutesId] = useState(purchase.minutesId || "");
	const [notes, setNotes] = useState(purchase.notes || "");

	// Use relationship picker hook
	const relationshipPicker = useRelationshipPicker({
		relationAType: "reimbursement",
		relationAId: purchase.id,
		initialRelationships: [],
	});

	// Smart autofill handlers
	const getReimbursementValues = () => ({
		amount: amount,
		description: description,
	});
	const handleAutofillSuggestions = (
		suggestions: Record<string, string | number | null>,
	) => {
		if (suggestions.amount != null) setAmount(String(suggestions.amount));
		if (suggestions.description != null)
			setDescription(String(suggestions.description));
	};

	// Receipt state (filter out drafts - receipts without pathname/url)
	const [selectedReceipts, _setSelectedReceipts] = useState<
		{ id: string; name: string; url: string }[]
	>(
		linkedReceipts
			.filter((r) => r.pathname && r.url)
			.map((r) => ({
				id: r.pathname!,
				name: r.name || r.pathname?.split("/").pop() || "Receipt",
				url: r.url!,
			})),
	);
	const [_isUploadingReceipt, setIsUploadingReceipt] = useState(false);

	// Receipt upload handler
	const _handleUploadReceipt = async (
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
			toast.error(
				typeof actionData.error === "string" ? actionData.error : "Error",
			);
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

		const initialReceiptIds = new Set(
			linkedReceipts.map((r) => r.pathname).filter(Boolean),
		);
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
			const receipt = linkedReceipts.find(
				(r: { id: string }) => r.id === rc.receiptId,
			);
			if (receipt?.pathname) {
				const parts = [
					rc.storeName,
					rc.totalAmount ? `${rc.totalAmount} ${rc.currency || "EUR"}` : null,
				].filter(Boolean);
				if (parts.length > 0)
					receiptSubtitles[receipt.pathname] = parts.join(" \u2022 ");
			}
		}
	}

	// Current path for navigation stack
	const currentPath = `/treasury/reimbursements/${purchase.id}/edit`;

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<PageHeader
					title={t("treasury.reimbursements.edit.title")}
					actions={
						<SmartAutofillButton
							entityType="reimbursement"
							entityId={purchase.id}
							getCurrentValues={getReimbursementValues}
							onSuggestions={handleAutofillSuggestions}
							useAI={purchase.status === "draft"}
						/>
					}
				/>

				<Form
					method="post"
					action={`/api/reimbursements/${purchase.id}/update`}
					className="space-y-6"
				>
					<input
						type="hidden"
						name="receiptLinks"
						value={JSON.stringify(selectedReceipts)}
					/>
					{/* Hidden fields for source context (auto-linking when created from picker) */}
					{sourceContext && (
						<>
							<input
								type="hidden"
								name="_sourceType"
								value={sourceContext.type}
							/>
							<input type="hidden" name="_sourceId" value={sourceContext.id} />
						</>
					)}
					{returnUrl && (
						<input type="hidden" name="_returnUrl" value={returnUrl} />
					)}

					{/* Reimbursement Details */}
					<TreasuryDetailCard
						title={t("treasury.reimbursements.edit.reimbursement_details")}
					>
						<div className="grid gap-4">
							<TreasuryField
								mode="edit"
								label={`${t("treasury.new_reimbursement.description")} *`}
								name="description"
								type="text"
								value={description}
								onChange={setDescription}
								required
								placeholder={t(
									"treasury.new_reimbursement.description_placeholder",
								)}
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
							sections={[
								{
									relationBType: "transaction",
									linkedEntities: (relationships.transaction?.linked ||
										[]) as unknown as AnyEntity[],
									availableEntities: (relationships.transaction?.available ||
										[]) as unknown as AnyEntity[],
									maxItems: 1,
									createType: "transaction",
									label: t("treasury.transactions.title"),
								},
								{
									relationBType: "receipt",
									linkedEntities: (relationships.receipt?.linked ||
										[]) as unknown as AnyEntity[],
									availableEntities: (relationships.receipt?.available ||
										[]) as unknown as AnyEntity[],
									createType: "receipt",
									label: t("treasury.receipts.title"),
								},
								{
									relationBType: "inventory",
									linkedEntities: (relationships.inventory?.linked ||
										[]) as unknown as AnyEntity[],
									availableEntities: (relationships.inventory?.available ||
										[]) as unknown as AnyEntity[],
									createType: "inventory",
									label: t("treasury.inventory.title"),
								},
							]}
							onLink={relationshipPicker.handleLink}
							onUnlink={relationshipPicker.handleUnlink}
							formData={relationshipPicker.toFormData()}
						/>

						<RelationshipContextStatus
							context={contextValues}
							entityType="reimbursement"
							entityId={purchase.id}
							currentEntityValue={{
								amount: Number(purchase.amount),
								description: purchase.description,
							}}
						/>
					</TreasuryDetailCard>

					<TreasuryFormActions
						isSubmitting={isSubmitting}
						disabled={!isDirty}
						onCancel={() => navigate(returnUrl || "/treasury/reimbursements")}
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
