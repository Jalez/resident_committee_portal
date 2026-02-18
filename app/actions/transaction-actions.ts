import { redirect } from "react-router";
import type {
	ReimbursementStatus,
	Transaction,
	TransactionStatus,
	TransactionType,
} from "~/db/schema";
import { getDatabase } from "~/db/server.server";

export async function handleDeleteTransaction(
	transaction: Transaction,
	year: number,
) {
	const db = getDatabase();

	try {
		// Note: Relationships are automatically cleaned up via database CASCADE
		// when the transaction is deleted, since entity_relationships has
		// onDelete: "cascade" on both relation ID columns.
		await db.deleteTransaction(transaction.id);
		return redirect(
			`/treasury/transactions?year=${year}&success=transaction_deleted`,
		);
	} catch (error) {
		console.error("[deleteTransaction] Error:", error);
		return { error: "Failed to delete transaction" };
	}
}

export async function handleUpdateTransaction(
	formData: FormData,
	transaction: Transaction,
	year: number,
) {
	const db = getDatabase();

	const allowedStatuses: TransactionStatus[] = [
		"pending",
		"complete",
		"paused",
		"declined",
	];
	const allowedReimbursementStatuses: ReimbursementStatus[] = [
		"not_requested",
		"requested",
		"approved",
		"declined",
	];

	const status =
		(formData.get("status") as TransactionStatus) || transaction.status;
	const reimbursementStatus =
		(formData.get("reimbursementStatus") as ReimbursementStatus) ||
		transaction.reimbursementStatus ||
		"not_requested";

	if (!allowedStatuses.includes(status)) {
		return { success: false, error: "Invalid status" };
	}
	if (!allowedReimbursementStatuses.includes(reimbursementStatus)) {
		return { success: false, error: "Invalid reimbursement status" };
	}

	const description = formData.get("description") as string;
	const amountStr = formData.get("amount") as string;
	const amount = amountStr
		? amountStr.replace(",", ".")
		: transaction.amount.toString();
	const type = (formData.get("type") as TransactionType) || transaction.type;
	const yearInput = formData.get("year");
	const parsedYear =
		typeof yearInput === "string" && yearInput.trim().length > 0
			? parseInt(yearInput, 10)
			: transaction.year;
	const nextYear = Number.isNaN(parsedYear) ? transaction.year : parsedYear;

	await db.updateTransaction(transaction.id, {
		status,
		reimbursementStatus,
		description,
		amount: amount || "0",
		type,
		year: nextYear,
	});

	return redirect(`/treasury/breakdown?year=${year}`);
}
