import { RECEIPT_ALLOWED_TYPES } from "~/lib/constants";
import { getReceiptStorage } from "~/lib/receipts/server";
import { buildReceiptPath } from "~/lib/receipts/utils";
import type { Route } from "./+types/_index";

export async function action({ request }: Route.ActionArgs) {
	try {
		const formData = await request.formData();
		const file = formData.get("file") as File | null;

		if (!file) {
			return Response.json({ error: "File is required" }, { status: 400 });
		}

		const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
		if (
			!RECEIPT_ALLOWED_TYPES.includes(
				ext as (typeof RECEIPT_ALLOWED_TYPES)[number],
			)
		) {
			return Response.json(
				{
					error: "invalid_file_type",
					allowedTypes: RECEIPT_ALLOWED_TYPES.join(", "),
				},
				{ status: 400 },
			);
		}

		const year = new Date().getFullYear().toString();
		const pathname = buildReceiptPath(year, file.name, "temp");

		const storage = getReceiptStorage();
		const result = await storage.uploadFile(pathname, file, {
			access: "public",
			addRandomSuffix: true,
		});

		return Response.json({
			success: true,
			url: result.url,
			pathname: result.pathname,
		});
	} catch (error) {
		console.error("[Temp Upload] Error:", error);
		return Response.json(
			{ error: "upload_failed", message: "Failed to upload file" },
			{ status: 500 },
		);
	}
}
