import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser, requireAnyPermission } from "~/lib/auth.server";
import {
	RECEIPT_ALLOWED_MIME_TYPES,
	RECEIPT_ALLOWED_TYPES,
} from "~/lib/constants";
import { processReceiptOCR } from "~/lib/receipt-ocr.server";
import { getReceiptStorage } from "~/lib/receipts/server";
import { buildReceiptPath, getReceiptsPrefix } from "~/lib/receipts/utils";

function isSafePathname(pathname: string): boolean {
	const prefix = getReceiptsPrefix();
	if (!pathname || !pathname.startsWith(prefix)) return false;
	if (pathname.includes("..")) return false;
	return true;
}

export async function action({ request }: ActionFunctionArgs) {
	try {
		if (request.method !== "POST") {
			return new Response(JSON.stringify({ error: "Method not allowed" }), {
				status: 405,
				headers: { "Content-Type": "application/json" },
			});
		}

		await requireAnyPermission(
			request,
			[
				"treasury:receipts:write",
				"treasury:reimbursements:write",
				"treasury:transactions:write",
				"inventory:write",
			],
			getDatabase,
		);

		const formData = await request.formData();
		const file = formData.get("file") as File | null;
		const year = formData.get("year") as string | null;
		const description = formData.get("description") as string | null;
		const ocrEnabled = formData.get("ocr_enabled") === "true";

		if (!file) {
			return new Response(JSON.stringify({ error: "File is required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Validate file type
		const fileExt = `.${file.name.split(".").pop()?.toLowerCase()}`;
		if (
			!RECEIPT_ALLOWED_TYPES.includes(
				fileExt as (typeof RECEIPT_ALLOWED_TYPES)[number],
			)
		) {
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

		// Validate MIME type (file.type is string; check against allowed list)
		const allowedMime: readonly string[] = RECEIPT_ALLOWED_MIME_TYPES;
		if (!allowedMime.includes(file.type)) {
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
		const pathname = buildReceiptPath(
			uploadYear,
			file.name,
			description || "kuitti",
		);

		if (!isSafePathname(pathname)) {
			return new Response(JSON.stringify({ error: "Invalid pathname" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		const storage = getReceiptStorage();
		const result = await storage.uploadFile(pathname, file, {
			access: "public",
		});

		let receiptId: string | undefined;

		// If OCR is enabled, we MUST create a database record for the receipt
		// so we can store the OCR results (receipt_contents table needs a generic receiptId)
		if (ocrEnabled) {
			const db = getDatabase();
			// We need the user ID for 'createdBy'.
			// We already called requirePermission, but didn't get the user object.
			// Let's fetch it again quickly or rely on the previous check's side effect if we refactored.
			// Ideally requirePermission returns user, but requireAnyPermission might not?
			// requireAnyPermission returns Promise<AuthenticatedUser> in auth.server.ts
			// Step 23 line 3 calls requireAnyPermission but awaits it without storing result.
			// I should verify requireAnyPermission signature.
			// But to be safe/quick, let's fetch user.
			const user = await getAuthenticatedUser(request, () => db);

			if (user) {
				const receipt = await db.createReceipt({
					name: file.name,
					description: description || null,
					url: result.url,
					pathname: result.pathname,
					createdBy: user.userId,
				});
				receiptId = receipt.id;

				// Trigger OCR (fire and forget to not block upload response too long?
				// Or await to ensure it's started? Let's await to catch immediate errors)
				try {
					// We don't await the full result processing if it takes too long,
					// but processReceiptOCR is async.
					// If we want the UI to show "Scanning...", we might want to return
					// something indicating OCR started.
					await processReceiptOCR(result.url, receipt.id);
				} catch (ocrError) {
					console.error("[Upload Action] OCR Error:", ocrError);
					// Proceed, don't fail the upload
				}
			}
		}

		return Response.json({
			pathname: result.pathname,
			url: result.url,
			receiptId,
		});
	} catch (error) {
		console.error("[receipts upload-action.server]", error);
		const message = error instanceof Error ? error.message : "Upload failed";
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
