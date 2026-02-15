import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server.server";
import { requireAnyPermission } from "~/lib/auth.server";
import { getReceiptStorage } from "~/lib/receipts/server";
import { getReceiptsPrefix } from "~/lib/receipts/utils";

function isSafeReceiptPathname(pathname: string): boolean {
	const prefix = getReceiptsPrefix();
	if (!pathname || !pathname.startsWith(prefix)) return false;
	if (pathname.includes("..")) return false;
	return true;
}

export async function action({ request }: ActionFunctionArgs) {
	await requireAnyPermission(
		request,
		["admin:storage:write", "treasury:receipts:delete"],
		getDatabase,
	);

	let pathname = "";
	const contentType = request.headers.get("content-type") || "";

	if (contentType.includes("application/json")) {
		const body = (await request.json().catch(() => ({}))) as {
			pathname?: string;
		};
		pathname = body.pathname || "";
	} else {
		const formData = await request.formData();
		pathname = (formData.get("pathname") as string) || "";
	}

	if (!isSafeReceiptPathname(pathname)) {
		return Response.json({ error: "Invalid pathname" }, { status: 400 });
	}

	const db = getDatabase();
	const storage = getReceiptStorage();

	const receipt = (await db.getReceipts()).find((r) => r.pathname === pathname);
	if (receipt) {
		const relationships = await db.getEntityRelationships("receipt", receipt.id);
		if (relationships.length > 0) {
			return Response.json(
				{ error: "Cannot delete linked receipt" },
				{ status: 409 },
			);
		}

		await db.deleteReceipt(receipt.id);
	}

	await storage.deleteFile(pathname);

	return Response.json({ success: true });
}
