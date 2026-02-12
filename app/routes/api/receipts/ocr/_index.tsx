import { type ActionFunctionArgs, data } from "react-router";
import { getDatabase } from "~/db/server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { processReceiptOCR } from "~/lib/receipt-ocr.server";

export async function action({ request }: ActionFunctionArgs) {
	// 1. Authentication & Permission Check
	const db = getDatabase();
	const user = await getAuthenticatedUser(request, () => db);

	if (!user) {
		return data({ success: false, error: "Unauthorized" }, { status: 401 });
	}

	const hasPermission =
		user.permissions.includes("treasury:receipts:write") ||
		user.permissions.includes("treasury:transactions:write") ||
		user.permissions.includes("treasury:reimbursements:write") ||
		user.permissions.includes("*");

	if (!hasPermission) {
		return data({ success: false, error: "Forbidden" }, { status: 403 });
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
