import { type ActionFunctionArgs, redirect } from "react-router";
import { handleUpdateTransaction } from "~/actions/transaction-actions";
import { getDatabase } from "~/db/server.server";
import type { RelationshipEntityType } from "~/db/types";
import { requirePermissionOrSelf } from "~/lib/auth.server";
import { getDraftAutoPublishStatus } from "~/lib/draft-auto-publish";
import { saveRelationshipChanges } from "~/lib/relationships/save-relationships.server";
import { getControlledTransactionFields } from "~/lib/relationships/transaction-control.server";

export async function action({ request, params }: ActionFunctionArgs) {
	const { transactionId } = params;
	if (!transactionId)
		throw new Response("Transaction ID required", { status: 400 });

	const db = getDatabase();
	const transaction = await db.getTransactionById(transactionId);
	if (!transaction) {
		throw new Response("Not Found", { status: 404 });
	}

	const user = await requirePermissionOrSelf(
		request,
		"treasury:transactions:update",
		"treasury:transactions:update-self",
		transaction.createdBy,
		getDatabase,
	);

	const formData = await request.formData();
	const year = transaction.year || new Date().getFullYear();

	// Save relationships
	await saveRelationshipChanges(
		db,
		"transaction",
		transaction.id,
		formData,
		user?.userId || "system",
	);

	// Auto-publish draft if all required fields are filled
	if (transaction.status === "draft") {
		const description = formData.get("description") as string;
		const amount = formData.get("amount") as string;
		const newStatus = getDraftAutoPublishStatus(
			"transaction",
			transaction.status,
			{
				description,
				amount,
			},
		);
		if (newStatus) {
			formData.set("status", newStatus);
		}
	}

	// Check for source context to create auto-link
	const sourceType = formData.get("_sourceType") as string | null;
	const sourceId = formData.get("_sourceId") as string | null;
	if (sourceType && sourceId) {
		const exists = await db.entityRelationshipExists(
			sourceType as RelationshipEntityType,
			sourceId,
			"transaction",
			transaction.id,
		);
		if (!exists) {
			await db.createEntityRelationship({
				relationAType: sourceType as RelationshipEntityType,
				relationId: sourceId,
				relationBType: "transaction",
				relationBId: transaction.id,
				createdBy: user?.userId || null,
			});
		}
	}

	// Relationship-controlled fields always override submitted values.
	const controlled = await getControlledTransactionFields(db, transaction.id);
	if (controlled.amount !== undefined) {
		formData.set("amount", controlled.amount);
	}
	if (controlled.description !== undefined) {
		formData.set("description", controlled.description);
	}
	if (controlled.type !== undefined) {
		formData.set("type", controlled.type);
	}
	if (controlled.status !== undefined) {
		formData.set("status", controlled.status);
	}
	if (controlled.reimbursementStatus !== undefined) {
		formData.set("reimbursementStatus", controlled.reimbursementStatus);
	}
	if (controlled.year !== undefined) {
		formData.set("year", String(controlled.year));
	}

	// Handle returnUrl redirect (from source entity picker)
	const returnUrl = formData.get("_returnUrl") as string | null;
	if (returnUrl) {
		const result = await handleUpdateTransaction(formData, transaction, year);
		if (
			result instanceof Response &&
			result.status >= 300 &&
			result.status < 400
		) {
			return redirect(returnUrl);
		}
		return result;
	}

	return await handleUpdateTransaction(formData, transaction, year);
}
