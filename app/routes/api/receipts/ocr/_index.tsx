import { type ActionFunctionArgs, data } from "react-router";
import { canEditSelf, getAuthenticatedUser, hasPermission } from "~/lib/auth.server";
import { processReceiptOCR } from "~/lib/receipt-ocr.server";

export async function action({ request }: ActionFunctionArgs) {
	// 1. Authentication & Permission Check
	const { getDatabase } = await import("~/db/server.server");
	const db = getDatabase();
	const user = await getAuthenticatedUser(request, () => db);

	if (!user) {
		return data({ success: false, error: "Unauthorized" }, { status: 401 });
	}

	// 2. Parse Input
	const formData = await request.formData();
	const receiptId = formData.get("receiptId");
	const receiptUrl = formData.get("receiptUrl");
	const rawText = formData.get("rawText");

	if (!receiptId || typeof receiptId !== "string") {
		return data(
			{ success: false, error: "Missing receiptId" },
			{ status: 400 },
		);
	}

	if (!receiptUrl || typeof receiptUrl !== "string") {
		return data(
			{ success: false, error: "Missing receiptUrl" },
			{ status: 400 },
		);
	}

	const receipt = await db.getReceiptById(receiptId);
	if (!receipt) {
		return data({ success: false, error: "Receipt not found" }, { status: 404 });
	}

	const canRunOcrWithGeneralPermission =
		hasPermission(user, "treasury:receipts:write") ||
		hasPermission(user, "treasury:receipts:update") ||
		hasPermission(user, "treasury:transactions:write") ||
		hasPermission(user, "treasury:reimbursements:write");

	const canRunOcrWithSelfPermission = canEditSelf(
		user,
		receipt.createdBy,
		"treasury:receipts:update-self",
	);

	if (!canRunOcrWithGeneralPermission && !canRunOcrWithSelfPermission) {
		return data({ success: false, error: "Forbidden" }, { status: 403 });
	}

	// 3. Process OCR
	try {
		const result = await processReceiptOCR(
			receiptUrl,
			receiptId,
			typeof rawText === "string" ? rawText : null,
		);
		return data(result);
	} catch (error) {
		console.error("API OCR Error:", error);
		return data(
			{ success: false, error: "Internal Server Error" },
			{ status: 500 },
		);
	}
}
