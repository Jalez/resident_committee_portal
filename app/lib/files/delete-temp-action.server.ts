import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server.server";
import { requireAnyPermission } from "~/lib/auth.server";
import { deleteTempFile } from "~/lib/file-upload.server";
import type { FileEntityType } from "~/lib/file-upload-types";

const PERMISSION_MAP: Record<FileEntityType, string[]> = {
	receipt: ["treasury:receipts:write", "treasury:receipts:update"],
	minute: ["minutes:write", "minutes:update"],
	avatar: ["profile:edit"],
};

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return Response.json({ error: "Method not allowed" }, { status: 405 });
	}

	const formData = await request.formData();
	const pathname = formData.get("pathname") as string | null;
	const entityType = formData.get("entityType") as FileEntityType | null;

	if (!pathname) {
		return Response.json({ error: "Pathname is required" }, { status: 400 });
	}

	if (!entityType || !["receipt", "minute", "avatar"].includes(entityType)) {
		return Response.json({ error: "Valid entityType is required" }, { status: 400 });
	}

	const permissions = PERMISSION_MAP[entityType];
	await requireAnyPermission(request, permissions, getDatabase);

	const result = await deleteTempFile(pathname, entityType);

	if (!result.success) {
		return Response.json({ error: result.error }, { status: 400 });
	}

	return Response.json({ success: true });
}
