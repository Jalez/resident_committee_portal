import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db";
import { requireAnyPermission } from "~/lib/auth.server";
import { RECEIPT_ALLOWED_TYPES, RECEIPT_ALLOWED_MIME_TYPES } from "~/lib/constants";
import { getReceiptStorage } from "~/lib/receipts";
import { buildReceiptPath, getReceiptsPrefix } from "~/lib/receipts/utils";

function isSafePathname(pathname: string): boolean {
	const prefix = getReceiptsPrefix();
	if (!pathname || !pathname.startsWith(prefix)) return false;
	if (pathname.includes("..")) return false;
	return true;
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return new Response(JSON.stringify({ error: "Method not allowed" }), {
			status: 405,
			headers: { "Content-Type": "application/json" },
		});
	}

	await requireAnyPermission(
		request,
		["treasury:receipts:write", "treasury:reimbursements:write", "treasury:transactions:write", "inventory:write"],
		getDatabase,
	);

	const formData = await request.formData();
	const file = formData.get("file") as File | null;
	const year = formData.get("year") as string | null;
	const description = formData.get("description") as string | null;

	if (!file) {
		return new Response(JSON.stringify({ error: "File is required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	// Validate file type
	const fileExt = `.${file.name.split(".").pop()?.toLowerCase()}`;
	if (!RECEIPT_ALLOWED_TYPES.includes(fileExt as (typeof RECEIPT_ALLOWED_TYPES)[number])) {
		return new Response(
			JSON.stringify({
				error: `Invalid file type. Allowed types: ${RECEIPT_ALLOWED_TYPES.join(", ")}`,
			}),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	// Validate MIME type
	if (!RECEIPT_ALLOWED_MIME_TYPES.includes(file.type)) {
		return new Response(
			JSON.stringify({
				error: `Invalid MIME type. Allowed types: ${RECEIPT_ALLOWED_MIME_TYPES.join(", ")}`,
			}),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const uploadYear = year || String(new Date().getFullYear());
	const pathname = buildReceiptPath(uploadYear, file.name, description || "kuitti");

	if (!isSafePathname(pathname)) {
		return new Response(JSON.stringify({ error: "Invalid pathname" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const storage = getReceiptStorage();
		const result = await storage.uploadFile(pathname, file, {
			access: "public",
			addRandomSuffix: true,
		});

		return Response.json({
			pathname: result.pathname,
			url: result.url,
		});
	} catch (error) {
		console.error("[api.receipts.upload.server]", error);
		const message = error instanceof Error ? error.message : "Upload failed";
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
