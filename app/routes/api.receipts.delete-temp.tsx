import { getReceiptStorage } from "~/lib/receipts";
import type { Route } from "./+types/api.receipts.delete-temp";

export async function action({ request }: Route.ActionArgs) {
	try {
		const formData = await request.formData();
		const pathname = formData.get("pathname") as string | null;

		if (!pathname) {
			return Response.json({ error: "Pathname is required" }, { status: 400 });
		}

		const storage = getReceiptStorage();
		await storage.deleteFile(pathname);

		return Response.json({ success: true });
	} catch (error) {
		console.error("[Temp Delete] Error:", error);
		return Response.json(
			{ error: "delete_failed", message: "Failed to delete file" },
			{ status: 500 },
		);
	}
}
