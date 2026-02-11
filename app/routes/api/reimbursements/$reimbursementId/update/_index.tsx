import { type ActionFunctionArgs, redirect } from "react-router";
import { getDatabase } from "~/db";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { clearCache } from "~/lib/cache.server";
import { getDraftAutoPublishStatus } from "~/lib/draft-auto-publish";
import {
	buildMinutesAttachment,
	buildReceiptAttachments,
	sendReimbursementEmail,
} from "~/lib/email.server";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";
import {
	getMissingReceiptsError,
	parseReceiptLinks,
} from "~/lib/treasury/receipt-validation";

export async function action({ request, params }: ActionFunctionArgs) {
	const { reimbursementId } = params;
	if (!reimbursementId)
		throw new Response("Reimbursement ID required", { status: 400 });

	const db = getDatabase();
	const purchase = await db.getPurchaseById(reimbursementId);
	if (!purchase) {
		throw new Response("Not Found", { status: 404 });
	}

	// Block edits to sent reimbursements
	if (purchase.emailSent) {
		return { success: false, error: "Cannot edit a sent reimbursement" };
	}

	const user = await requirePermissionOrSelf(
		request,
		"treasury:reimbursements:update",
		"treasury:reimbursements:update-self",
		purchase.createdBy,
		getDatabase,
	);

	const formData = await request.formData();
	const actionType = formData.get("_action") as string;

	// Handle special actions
	if (actionType === "refreshReceipts") {
		clearCache("RECEIPTS_BY_YEAR");
		return { success: true };
	}

	if (actionType === "sendRequest") {
		const receiptLinks = parseReceiptLinks(formData);
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
					minutesReference:
						purchase.minutesName ||
						purchase.minutesId ||
						"Ei määritetty / Not specified",
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
				return {
					success: true,
					message: "treasury.reimbursements.email_sent_success",
				};
			} else {
				await db.updatePurchase(purchase.id, {
					emailError: emailResult.error || "Email sending failed",
				});
				return {
					success: false,
					error: emailResult.error || "Email sending failed",
				};
			}
		} catch (error) {
			console.error("[Reimbursement API] Email error:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			await db.updatePurchase(purchase.id, {
				emailError: errorMessage,
			});
			return { success: false, error: errorMessage };
		}
	}

	// Default: update reimbursement
	const purchaserName = formData.get("purchaserName") as string;
	const bankAccount = formData.get("bankAccount") as string;
	const minutesInfo = formData.get("minutesId") as string;
	const [minutesId, minutesName] = (minutesInfo || "").includes("|")
		? minutesInfo.split("|")
		: [minutesInfo, ""];

	const notes = formData.get("notes") as string;
	const amount = formData.get("amount") as string;
	const description = formData.get("description") as string;

	// Link management is handled by saveRelationshipChanges below
	await db.updatePurchase(reimbursementId, {
		purchaserName,
		bankAccount,
		minutesId: minutesId || undefined,
		minutesName: minutesName || undefined,
		notes: notes || undefined,
		amount: amount || purchase.amount,
		description: description || purchase.description,
	});

	// Save relationships
	await saveRelationshipChanges(
		db,
		"reimbursement",
		reimbursementId,
		formData,
		user?.userId || null,
	);

	// Auto-publish draft
	if (purchase.status === "draft") {
		const newStatus = getDraftAutoPublishStatus(
			"reimbursement",
			purchase.status,
			{
				description: description || purchase.description,
				amount: amount || purchase.amount,
				purchaserName,
				bankAccount,
			},
		);
		if (newStatus) {
			await db.updatePurchase(reimbursementId, { status: newStatus as any });
		}
	}

	// Handle returnUrl
	const returnUrl = formData.get("_returnUrl") as string | null;
	if (returnUrl) {
		return redirect(returnUrl);
	}

	return redirect(
		`/treasury/reimbursements?year=${purchase.year}&success=Reimbursement updated`,
	);
}
