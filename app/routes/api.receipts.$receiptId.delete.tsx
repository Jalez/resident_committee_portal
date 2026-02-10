import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { getDatabase } from "~/db";
import { requireAnyPermission } from "~/lib/auth.server";
import { clearCache } from "~/lib/cache.server";
import { getReceiptStorage } from "~/lib/receipts";
import { getReceiptsPrefix } from "~/lib/receipts/utils";

function isSafePathname(pathname: string): boolean {
	const prefix = getReceiptsPrefix();
	if (!pathname || !pathname.startsWith(prefix)) return false;
	if (pathname.includes("..")) return false;
	return true;
}

export async function loader({ request: _request, params }: LoaderFunctionArgs) {
	console.log("[api.receipts.$receiptId.delete] Loader hit (should not happen for DELETE)");
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
	const { receiptId } = params;

	let jsonData: any = null;
	try {
		jsonData = await request.json();
	} catch {
		// Ignore JSON parse errors
	}

	console.log(`[api.receipts.$receiptId.delete] Action hit for ID: ${receiptId}, Method: ${request.method}`);

	if (request.method !== "DELETE" && request.method !== "POST") {
		console.log(`[api.receipts.$receiptId.delete] Rejected method: ${request.method}`);
		return new Response(JSON.stringify({ error: "Method not allowed" }), {
			status: 405,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (!receiptId) {
		return new Response(JSON.stringify({ error: "Receipt ID is required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	await requireAnyPermission(
		request,
		["admin:storage:write", "treasury:receipts:delete", "treasury:reimbursements:write", "treasury:transactions:write", "inventory:write"],
		getDatabase,
	);

	const db = getDatabase();
	const receipt = await db.getReceiptById(receiptId);

	if (!receipt) {
		return new Response(JSON.stringify({ error: "Receipt not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	}

	const pathname = jsonData?.pathname || receipt.pathname;

	// Reject delete if receipt is linked to any entity via relationships
	const relationships = await db.getEntityRelationships("receipt", receipt.id);
	if (relationships.length > 0) {
		return new Response(
			JSON.stringify({
				error: "Cannot delete a linked item. Remove all links first.",
			}),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	try {
		// Delete from storage if we have a pathname
		if (pathname && isSafePathname(pathname)) {
			console.log(`[api.receipts.delete] Deleting storage file: ${pathname}`);
			const storage = getReceiptStorage();
			await storage.deleteFile(pathname);
		}

		// Delete from database
		await db.deleteReceipt(receipt.id);

		clearCache("RECEIPTS_BY_YEAR");
		const returnUrl = jsonData?._returnUrl as string | null;
		if (returnUrl) {
			return redirect(returnUrl);
		}
		return Response.json({ success: true });
	} catch (error) {
		console.error("[api.receipts.delete]", error);
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
