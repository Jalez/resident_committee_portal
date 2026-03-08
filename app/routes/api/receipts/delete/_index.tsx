import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server.server";
import { requireAnyPermission } from "~/lib/auth.server";
import { getReceiptStorage } from "~/lib/receipts/server";
import { getReceiptsPrefix } from "~/lib/receipts/utils";

function normalizeReceiptPath(value: string | null | undefined): string | null {
	if (!value) return null;

	try {
		if (value.startsWith("http://") || value.startsWith("https://")) {
			const pathname = new URL(value).pathname.replace(/^\/+/, "");
			return pathname || null;
		}
	} catch {
		// Fall through to string normalization below.
	}

	return value.replace(/^\/+/, "") || null;
}

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
	const normalizedPathname = normalizeReceiptPath(pathname);

	const receipt = (await db.getReceipts()).find((r) => {
		const normalizedReceiptPath = normalizeReceiptPath(r.pathname);
		const normalizedReceiptUrlPath = normalizeReceiptPath(r.url);
		return (
			normalizedReceiptPath === normalizedPathname ||
			normalizedReceiptUrlPath === normalizedPathname
		);
	});
	if (receipt) {
		return Response.json(
			{ error: "Cannot delete receipt file with an existing receipt record" },
			{ status: 409 },
		);
	}

	await storage.deleteFile(pathname);

	return Response.json({ success: true });
}
