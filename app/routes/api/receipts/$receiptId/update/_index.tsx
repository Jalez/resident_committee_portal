import { type ActionFunctionArgs, redirect } from "react-router";
import {
	deleteReceipt,
	handleFileUpload,
	saveReceiptOCRContent,
	updateReceiptInDB,
	validateReceiptUpdate,
} from "~/actions/receipt-actions";
import { getDatabase } from "~/db";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { getDraftAutoPublishStatus } from "~/lib/draft-auto-publish";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";

export async function action({ request, params }: ActionFunctionArgs) {
	const { receiptId } = params;
	if (!receiptId) throw new Response("Receipt ID required", { status: 400 });

	const db = getDatabase();
	const receipt = await db.getReceiptById(receiptId);
	if (!receipt) {
		throw new Response("Not Found", { status: 404 });
	}

	const formData = await request.formData();
	const actionType = formData.get("_action") as string | null;

	if (actionType === "delete") {
		await deleteReceipt(receiptId);
		return redirect("/treasury/receipts");
	}

	const user = await requirePermissionOrSelf(
		request,
		"treasury:receipts:update",
		"treasury:receipts:update-self",
		receipt.createdBy,
		getDatabase,
	);

	// Validate form data
	const validationResult = await validateReceiptUpdate(formData);
	if (!validationResult.success) {
		return {
			error: "Validation failed",
			fieldErrors: validationResult.error.flatten().fieldErrors,
		};
	}

	const name = (formData.get("name") as string | null) || "";
	const description = formData.get("description") as string | null;

	// Handle file upload
	const uploadResult = await handleFileUpload(formData, receipt, name);
	if ("error" in uploadResult) {
		return uploadResult;
	}

	const { nextUrl, nextPathname, nextName } = uploadResult;

	// Update receipt in DB
	await updateReceiptInDB(
		receiptId,
		nextName,
		description?.trim() || null,
		nextUrl,
		nextPathname,
	);

	// Auto-publish draft
	if (receipt.status === "draft") {
		const newStatus = getDraftAutoPublishStatus("receipt", receipt.status, {
			name: nextName,
		});
		if (newStatus) {
			await db.updateReceipt(receiptId, { status: newStatus as any });
		}
	}

	// Save relationships
	await saveRelationshipChanges(
		db,
		"receipt",
		receiptId,
		formData,
		user?.userId || null,
	);

	// Create relationship from source context if present
	const sourceType = formData.get("sourceType") as string | null;
	const sourceId = formData.get("sourceId") as string | null;
	if (sourceType && sourceId) {
		const exists = await db.entityRelationshipExists(
			sourceType as any,
			sourceId,
			"receipt",
			receiptId,
		);
		if (!exists) {
			await db.createEntityRelationship({
				relationAType: sourceType as any,
				relationId: sourceId,
				relationBType: "receipt",
				relationBId: receiptId,
				createdBy: user?.userId || null,
			});
		}
	}

	// Save OCR content
	await saveReceiptOCRContent(formData, receipt);

	// Handle returnUrl
	const returnUrl = formData.get("_returnUrl") as string | null;
	if (returnUrl) {
		return redirect(returnUrl);
	}

	const pathnameParts = receipt.pathname?.split("/") || [];
	const year = pathnameParts[1] || new Date().getFullYear().toString();

	return redirect(`/treasury/receipts?year=${year}&success=receipt_updated`);
}
