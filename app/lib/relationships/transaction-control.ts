import type {
	PurchaseStatus,
	ReimbursementStatus,
	TransactionStatus,
} from "~/db/schema";

export function mapPurchaseStatusToTransactionControl(
	purchaseStatus: PurchaseStatus,
): {
	status: TransactionStatus;
	reimbursementStatus: ReimbursementStatus;
} {
	if (purchaseStatus === "approved" || purchaseStatus === "reimbursed") {
		return { status: "complete", reimbursementStatus: "approved" };
	}

	if (purchaseStatus === "rejected") {
		return { status: "declined", reimbursementStatus: "declined" };
	}

	// pending / draft reimbursement requests behave as "requested" for transaction flow
	return { status: "pending", reimbursementStatus: "requested" };
}
