import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
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

export async function loader({ request: _request }: LoaderFunctionArgs) {
	// This route only handles POST/DELETE requests via action
	return new Response(JSON.stringify({ error: "Method not allowed" }), {
		status: 405,
		headers: {
			"Content-Type": "application/json",
			Allow: "POST, DELETE",
		},
	});
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST" && request.method !== "DELETE") {
		return new Response(JSON.stringify({ error: "Method not allowed" }), {
			status: 405,
			headers: { "Content-Type": "application/json" },
		});
	}

	await requireAnyPermission(
		request,
		["admin:storage:write", "treasury:receipts:delete", "treasury:reimbursements:write", "treasury:transactions:write", "inventory:write"],
		getDatabase,
	);

	// Handle both form data and JSON
	let pathname: string | null = null;
	const contentType = request.headers.get("content-type");

	if (contentType?.includes("application/json")) {
		let body: { pathname?: string };
		try {
			body = (await request.json()) as { pathname?: string };
			pathname = body.pathname ?? null;
		} catch {
			return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
	} else {
		const formData = await request.formData();
		pathname = (formData.get("pathname") as string) || null;
	}
	if (!pathname || typeof pathname !== "string" || !isSafePathname(pathname)) {
		return new Response(JSON.stringify({ error: "Invalid pathname" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	// Reject delete if receipt is linked to a reimbursement request
	const db = getDatabase();
	const receipts = await db.getReceipts();
	const receipt = receipts.find((r) => r.pathname === pathname);
	if (receipt?.purchaseId) {
		return new Response(
			JSON.stringify({
				error: "Cannot delete receipt linked to a reimbursement request",
			}),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	try {
		// Delete from storage
		const storage = getReceiptStorage();
		await storage.deleteFile(pathname);

		// Delete from database if record exists (receipt from above, no purchaseId)
		if (receipt) {
			await db.deleteReceipt(receipt.id);
		}

		clearCache("RECEIPTS_BY_YEAR");
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
