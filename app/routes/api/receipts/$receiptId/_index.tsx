import type { LoaderFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";

/**
 * API endpoint to get receipt data by ID
 * Returns receipt with OCR content if available
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
	console.log("[api.receipts.$receiptId] loader hit for:", params.receiptId);
	await requirePermission(request, "treasury:receipts:read", getDatabase);

	const db = getDatabase();
	const receiptId = params.receiptId;

	if (!receiptId) {
		return Response.json({ error: "Receipt ID is required" }, { status: 400 });
	}

	try {
		const receipt = await db.getReceiptById(receiptId);

		if (!receipt) {
			return Response.json({ error: "Receipt not found" }, { status: 404 });
		}

		return Response.json({
			receipt,
		});
	} catch (error) {
		console.error("[API Receipt] Error fetching receipt:", error);
		return Response.json(
			{
				error: "Failed to fetch receipt",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}
