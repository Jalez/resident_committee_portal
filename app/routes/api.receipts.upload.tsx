import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db";
import { requireAnyPermission } from "~/lib/auth.server";
import { RECEIPT_ALLOWED_MIME_TYPES } from "~/lib/constants";
import { getReceiptsPrefix } from "~/lib/receipts/utils";

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return new Response(JSON.stringify({ error: "Method not allowed" }), {
			status: 405,
			headers: { "Content-Type": "application/json" },
		});
	}

	await requireAnyPermission(
		request,
		["reimbursements:write", "transactions:write", "inventory:write"],
		getDatabase,
	);

	const body = (await request.json()) as HandleUploadBody;

	try {
		const jsonResponse = await handleUpload({
			body,
			request,
			onBeforeGenerateToken: async (pathname: string) => {
				if (!pathname || !pathname.startsWith(getReceiptsPrefix())) {
					throw new Error("Invalid receipt upload path");
				}

				return {
					allowedContentTypes: [...RECEIPT_ALLOWED_MIME_TYPES],
					addRandomSuffix: true, // Ensure unique path when same filename uploaded same day
				};
			},
			// No cache to clear: receipts list is always fetched fresh (see vercel-blob.server.ts)
		});

		return Response.json(jsonResponse);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Upload failed";
		return new Response(JSON.stringify({ error: message }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}
}
