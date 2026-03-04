import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server.server";
import { requireAnyPermission } from "~/lib/auth.server";
import { deleteTempFile } from "~/lib/file-upload.server";
import type { FileEntityType } from "~/lib/file-upload-types";

const PERMISSION_MAP: Record<FileEntityType, string[]> = {
	receipt: ["treasury:receipts:write", "treasury:receipts:update"],
	minute: ["minutes:write", "minutes:update"],
	avatar: ["profile:write:own"],
	mail_attachment: ["committee:email"],
};

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return Response.json({ error: "Method not allowed" }, { status: 405 });
	}

	let body: { entityType?: FileEntityType; pathname?: string } = {};
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const entityType = body.entityType;
	const pathname = body.pathname;
	if (!entityType || !pathname) {
		return Response.json(
			{ error: "entityType and pathname are required" },
			{ status: 400 },
		);
	}
	if (!(entityType in PERMISSION_MAP)) {
		return Response.json({ error: "Invalid entityType" }, { status: 400 });
	}

	await requireAnyPermission(request, PERMISSION_MAP[entityType], getDatabase);
	const result = await deleteTempFile(pathname, entityType);
	if (!result.success) {
		return Response.json({ error: result.error || "Delete failed" }, { status: 400 });
	}
	return Response.json({ success: true });
}
