import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { getDatabase } from "~/db";
import { requireDeletePermissionOrSelf } from "~/lib/auth.server";
import { clearCache } from "~/lib/cache.server";

export async function loader({ request: _request, params }: LoaderFunctionArgs) {
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
    const { transactionId } = params;

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

    if (!transactionId) {
        return new Response(JSON.stringify({ error: "Transaction ID is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const db = getDatabase();
    const transaction = await db.getTransactionById(transactionId);

    if (!transaction) {
        return new Response(JSON.stringify({ error: "Transaction not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
        });
    }

    await requireDeletePermissionOrSelf(
        request,
        "treasury:transactions:delete",
        "treasury:transactions:delete-self",
        transaction.createdBy,
        getDatabase,
    );

    // Check for linked entities that should prevent deletion
    const relationships = await db.getEntityRelationships("transaction", transaction.id);

    // For transactions, we might allow deletion even if linked, but the user requested "similar to receipts"
    // and in receipts we check for links. However, transactions are often the "end" of a relation.
    // But let's check if it's linked to a reimbursement that is already processed/sent.
    const reimbursementRel = relationships.find(r => r.relationBType === "reimbursement" || r.relationAType === "reimbursement");
    if (reimbursementRel) {
        const reimbursementId = reimbursementRel.relationBType === "reimbursement" ? reimbursementRel.relationBId : reimbursementRel.relationId;
        const purchase = await db.getPurchaseById(reimbursementId);
        if (purchase && purchase.emailSent && purchase.status !== "rejected") {
            return new Response(
                JSON.stringify({
                    error: "Cannot delete transaction linked to a sent reimbursement request. Reject the reimbursement first.",
                }),
                {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                },
            );
        }
    }

    try {
        await db.deleteTransaction(transaction.id);
        clearCache("TRANSACTIONS_BY_YEAR");
        //If there is a return url, redirect to it
        const returnUrl = jsonData?._returnUrl as string | null;
        if (returnUrl) {
            return redirect(returnUrl);
        }
        return Response.json({ success: true });
    } catch (error) {
        console.error("[api.transactions.delete]", error);
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
