import type { TransactionType } from "~/db/schema";
import type { getDatabase } from "~/db/server.server";
import { getRelationshipContext } from "./relationship-context.server";
import { mapPurchaseStatusToTransactionControl } from "./transaction-control";

export interface TransactionControlledFields {
	amount?: string;
	description?: string;
	type?: TransactionType;
	status?: ReturnType<typeof mapPurchaseStatusToTransactionControl>["status"];
	reimbursementStatus?: ReturnType<
		typeof mapPurchaseStatusToTransactionControl
	>["reimbursementStatus"];
}

export async function getControlledTransactionFields(
	db: ReturnType<typeof getDatabase>,
	transactionId: string,
): Promise<TransactionControlledFields> {
	const controlled: TransactionControlledFields = {};

	const context = await getRelationshipContext(
		db,
		"transaction",
		transactionId,
	);
	const hasContextControl =
		context.valueSource === "receipt" ||
		context.valueSource === "reimbursement";

	if (hasContextControl && context.totalAmount !== null) {
		controlled.amount = context.totalAmount.toFixed(2);
	}
	if (hasContextControl && context.description?.trim()) {
		controlled.description = context.description.trim();
	}

	const relationships = await db.getEntityRelationships(
		"transaction",
		transactionId,
	);
	const linkedReimbursementId = relationships
		.map((rel) => {
			if (
				rel.relationAType === "transaction" &&
				rel.relationId === transactionId &&
				rel.relationBType === "reimbursement"
			) {
				return rel.relationBId;
			}
			if (
				rel.relationBType === "transaction" &&
				rel.relationBId === transactionId &&
				rel.relationAType === "reimbursement"
			) {
				return rel.relationId;
			}
			return null;
		})
		.find((id): id is string => Boolean(id));

	if (!linkedReimbursementId) return controlled;

	const linkedReimbursement = await db.getPurchaseById(linkedReimbursementId);
	if (!linkedReimbursement) return controlled;

	controlled.type = "expense";
	const mapped = mapPurchaseStatusToTransactionControl(
		linkedReimbursement.status,
	);
	controlled.status = mapped.status;
	controlled.reimbursementStatus = mapped.reimbursementStatus;

	return controlled;
}
