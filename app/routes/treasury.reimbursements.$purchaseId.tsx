import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useActionData, useFetcher, useRouteLoaderData } from "react-router";
import { toast } from "sonner";
import { maskBankAccount } from "~/lib/mask-bank-account";
import { PageWrapper } from "~/components/layout/page-layout";
import { PageHeader } from "~/components/layout/page-header";
import {
	TREASURY_PURCHASE_STATUS_VARIANTS,
	TREASURY_TRANSACTION_STATUS_VARIANTS,
} from "~/components/treasury/colored-status-link-badge";
import {
	TreasuryDetailCard,
	TreasuryField,
	TreasuryRelationList,
} from "~/components/treasury/treasury-detail-components";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	getDatabase,
	type Purchase,
	type Receipt,
	type Transaction,
} from "~/db";
import type { ReceiptContent } from "~/db/schema";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { SITE_CONFIG } from "~/lib/config.server";
import {
	buildMinutesAttachment,
	buildReceiptAttachments,
	isEmailConfigured,
	sendReimbursementEmail,
} from "~/lib/email.server";
import type { loader as rootLoader } from "~/root";
import type { Route } from "./+types/treasury.reimbursements.$purchaseId";

export function meta({ data }: Route.MetaArgs) {
	const description = data?.purchase?.description;
	const title = description
		? `${description.substring(0, 30)} / View Reimbursement`
		: "View Reimbursement";
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

	// Check permission with self-read support
	await requirePermissionOrSelf(
		request,
		"treasury:reimbursements:read",
		"treasury:reimbursements:read-self",
		purchase.createdBy,
		getDatabase,
	);

	// Get linked transaction if exists
	let linkedTransaction = null;
	if (purchase.id) {
		linkedTransaction = await db.getTransactionByPurchaseId(purchase.id);
	}

	// Get receipts linked to this purchase
	const linkedReceipts = await db.getReceiptsByPurchaseId(purchase.id);

	// Get OCR content for receipts
	const receiptIds = linkedReceipts.map(r => r.id);
	const receiptContents = receiptIds.length > 0 ? await db.getReceiptContentsByReceiptIds(receiptIds) : [];

	return {
		siteConfig: SITE_CONFIG,
		purchase,
		linkedTransaction,
		linkedReceipts,
		receiptContents,
		emailConfigured: await isEmailConfigured(),
	};
}

export async function action({ request, params }: Route.ActionArgs) {
	const db = getDatabase();
	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	const purchase = await db.getPurchaseById(params.purchaseId);
	if (!purchase) {
		throw new Response("Not Found", { status: 404 });
	}

	await requirePermissionOrSelf(
		request,
		"treasury:reimbursements:update",
		"treasury:reimbursements:update-self",
		purchase.createdBy,
		getDatabase,
	);

	if (actionType === "sendRequest") {
		const linkedReceipts = await db.getReceiptsByPurchaseId(purchase.id);

		if (linkedReceipts.length === 0) {
			return { success: false, error: "treasury.new_reimbursement.missing_receipts" };
		}

		const receiptLinks = linkedReceipts.map(r => ({
			id: r.pathname,
			name: r.name || r.pathname.split("/").pop() || "Receipt",
			url: r.url
		}));

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
			console.error("[Reimbursement View] Email error:", error);
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			await db.updatePurchase(purchase.id, {
				emailError: errorMessage,
			});
			return { success: false, error: errorMessage };
		}
	}

	return { success: false, error: "Invalid action" };
}

export default function ViewReimbursement({ loaderData }: Route.ComponentProps) {
	const {
		purchase,
		linkedTransaction,
		linkedReceipts,
		receiptContents: receiptContentsData,
	} = loaderData as {
		purchase: Purchase;
		linkedTransaction: Transaction | null;
		linkedReceipts: Receipt[];
		receiptContents: ReceiptContent[];
	};
	const rootData = useRouteLoaderData<typeof rootLoader>("root");
	const { t } = useTranslation();
	const fetcher = useFetcher();
	const actionData = useActionData<typeof action>();

	// Toast for email sending
	useEffect(() => {
		if (fetcher.data?.success) {
			if (fetcher.data.message) {
				toast.success(t(fetcher.data.message));
			}
		} else if (fetcher.data?.error) {
			toast.error(typeof fetcher.data.error === "string" ? fetcher.data.error : "Error");
		}
	}, [fetcher.data, t]);

	// Check if user can edit
	const canUpdateGeneral =
		rootData?.user?.permissions?.includes("treasury:reimbursements:update") ||
		rootData?.user?.permissions?.includes("*");
	const canUpdateSelf =
		rootData?.user?.permissions?.includes("treasury:reimbursements:update-self") &&
		purchase.createdBy &&
		rootData?.user?.userId === purchase.createdBy;
	const canUpdate = canUpdateGeneral || canUpdateSelf;

	// Can view full bank account if user can update OR is the creator
	const isCreator = purchase.createdBy && rootData?.user?.userId === purchase.createdBy;
	const canViewFullBankAccount = canUpdateGeneral || isCreator;

	const formatCurrency = (value: string | number) => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		return `${num.toFixed(2).replace(".", ",")} €`;
	};

	const transactionRelations = linkedTransaction
		? [
			{
				to: `/treasury/transactions/${linkedTransaction.id}`,
				title: t("treasury.reimbursements.view_transaction"),
				status: linkedTransaction.status,
				id: linkedTransaction.id,
				variantMap: TREASURY_TRANSACTION_STATUS_VARIANTS,
			},
		]
		: [];

	const receiptRelations = linkedReceipts.map((receipt) => {
		const ocr = receiptContentsData?.find(rc => rc.receiptId === receipt.id);
		const subtitle = ocr ? [ocr.storeName, ocr.totalAmount ? `${ocr.totalAmount} ${ocr.currency || 'EUR'}` : null].filter(Boolean).join(' \u2022 ') : null;
		return {
			to: `/treasury/receipts/${receipt.id}`,
			title: receipt.name || receipt.pathname.split("/").pop() || "Receipt",
			status: purchase.status,
			id: receipt.id,
			variantMap: TREASURY_PURCHASE_STATUS_VARIANTS,
			subtitle,
		};
	});

	const canSendRequest =
		canUpdate &&
		purchase.purchaserName &&
		purchase.bankAccount &&
		purchase.minutesId &&
		linkedReceipts.length > 0;

	return (
		<PageWrapper>
			<div className="w-full max-w-2xl mx-auto px-4 pb-12">
				<div className="flex items-center justify-between mb-4">
					<PageHeader title={t("treasury.reimbursements.view.title")} />
					<div className="flex gap-2">
						{canSendRequest && !purchase.emailSent && (
							<fetcher.Form method="post">
								<Button
									type="submit"
									name="_action"
									value="sendRequest"
									variant="secondary"
									disabled={fetcher.state === "submitting"}
								>
									<span className="material-symbols-outlined mr-2">send</span>
									{t("treasury.reimbursements.send_request")}
								</Button>
							</fetcher.Form>
						)}
						{canUpdate && !purchase.emailSent && (
							<Link to={`/treasury/reimbursements/${purchase.id}/edit`}>
								<Button variant="default">
									<span className="material-symbols-outlined mr-2">edit</span>
									{t("common.actions.edit")}
								</Button>
							</Link>
						)}
						{purchase.emailSent && (
							<div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-md">
								<span className="material-symbols-outlined text-base">lock</span>
								{t("treasury.reimbursements.locked_sent")}
							</div>
						)}
					</div>
				</div>

				<div className="space-y-6">
					<TreasuryDetailCard
						title={t("treasury.reimbursements.edit.reimbursement_details")}
					>
						<div className="grid gap-4">
							<TreasuryField label={t("treasury.new_reimbursement.description")}>
								{purchase.description || "—"}
							</TreasuryField>
							<TreasuryField
								label={t("treasury.new_reimbursement.amount")}
								valueClassName="text-foreground font-bold"
							>
								{formatCurrency(purchase.amount)}
							</TreasuryField>
							<TreasuryField label={t("treasury.new_reimbursement.purchaser_name")}>
								{purchase.purchaserName || "—"}
							</TreasuryField>
							<TreasuryField label={t("treasury.new_reimbursement.bank_account")}>
								<span className="font-mono">
									{canViewFullBankAccount
										? (purchase.bankAccount || "—")
										: maskBankAccount(purchase.bankAccount)}
								</span>
							</TreasuryField>
							{purchase.notes ? (
								<TreasuryField label={t("treasury.new_reimbursement.notes")}>
									{purchase.notes}
								</TreasuryField>
							) : null}
							<TreasuryField
								label={t("treasury.reimbursements.status")}
								valueClassName="text-foreground"
							>
								<Badge variant="secondary">
									{t(`treasury.reimbursements.statuses.${purchase.status}`)}
								</Badge>
							</TreasuryField>
							{purchase.emailSent && (
								<TreasuryField
									label={t("treasury.reimbursements.email_status")}
									valueClassName="text-green-600 dark:text-green-400 font-medium flex items-center gap-2"
								>
									<span className="material-symbols-outlined text-sm">check_circle</span>
									{t("treasury.reimbursements.email_sent")}
								</TreasuryField>
							)}
						</div>

						<TreasuryRelationList
							label={t("treasury.new_reimbursement.transaction_section_title")}
							items={transactionRelations}
							withSeparator
						/>

						<TreasuryRelationList
							label={t("treasury.receipts.title")}
							items={receiptRelations}
							withSeparator
						/>
					</TreasuryDetailCard>
				</div>
			</div>
		</PageWrapper>
	);
}
