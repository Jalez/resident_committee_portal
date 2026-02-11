import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	redirect,
} from "react-router";
import { getDatabase } from "~/db";
import { requireDeletePermissionOrSelf } from "~/lib/auth.server";

export async function loader({
	request: _request,
	params,
}: LoaderFunctionArgs) {
	// This route only handles POST/DELETE requests via action
	return new Response(JSON.stringify({ error: "Method not allowed" }), {
		status: 405,
		headers: {
			"Content-Type": "application/json",
			Allow: "POST, DELETE",
		},
	});
}

export async function action({ request, params }: ActionFunctionArgs) {
	const { reimbursementId } = params;

	let jsonData: any = null;
	try {
		jsonData = await request.json();
	} catch {
		// Ignore JSON parse errors
	}

	if (request.method !== "DELETE" && request.method !== "POST") {
		return new Response(JSON.stringify({ error: "Method not allowed" }), {
			status: 405,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (!reimbursementId) {
		return new Response(
			JSON.stringify({ error: "Reimbursement ID is required" }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const db = getDatabase();
	const purchase = await db.getPurchaseById(reimbursementId);

	if (!purchase) {
		return new Response(JSON.stringify({ error: "Reimbursement not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	}

	await requireDeletePermissionOrSelf(
		request,
		"treasury:reimbursements:delete",
		"treasury:reimbursements:delete-self",
		purchase.createdBy,
		getDatabase,
	);

	// Check if already processed
	if (purchase.emailSent && purchase.status !== "rejected") {
		return new Response(
			JSON.stringify({
				error:
					"Cannot delete a reimbursement request that has already been sent. Reject it first if needed.",
			}),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	try {
		// Decline linked transaction before deleting purchase (as per original logic in treasury.reimbursements.tsx)
		const txRelationships = await db.getEntityRelationships(
			"reimbursement",
			purchase.id,
		);
		const txRel = txRelationships.find(
			(r) =>
				r.relationBType === "transaction" || r.relationAType === "transaction",
		);
		const linkedTransaction = txRel
			? await db.getTransactionById(
					txRel.relationBType === "transaction"
						? txRel.relationBId
						: txRel.relationId,
				)
			: null;

		if (linkedTransaction) {
			await db.updateTransaction(linkedTransaction.id, {
				status: "declined",
				reimbursementStatus: "declined",
			});
		}

		await db.deletePurchase(purchase.id);

		const returnUrl = jsonData?._returnUrl as string | null;
		if (returnUrl) {
			return redirect(returnUrl);
		}
		return Response.json({ success: true });
	} catch (error) {
		console.error("[api.reimbursements.delete]", error);
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "Delete failed",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}
