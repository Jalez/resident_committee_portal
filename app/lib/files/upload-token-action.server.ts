import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { getEntityPrefix } from "~/lib/file-upload.server";
import type { FileEntityType } from "~/lib/file-upload-types";
import { FILE_TYPE_CONFIGS } from "~/lib/file-upload-types";

const PERMISSION_MAP: Record<FileEntityType, string[]> = {
	receipt: ["treasury:receipts:write", "treasury:receipts:update"],
	minute: ["minutes:write", "minutes:update"],
	avatar: ["profile:edit"],
};

function isValidPathname(pathname: string, entityType: FileEntityType, userId?: string): boolean {
	const prefix = getEntityPrefix(entityType);
	if (!pathname || !pathname.startsWith(prefix)) return false;
	if (pathname.includes("..")) return false;
	
	if (entityType === "avatar" && userId) {
		const rest = pathname.slice(prefix.length);
		const parts = rest.split("/").filter(Boolean);
		if (parts.length !== 1) return false;
		const [file] = parts;
		const dot = file.indexOf(".");
		if (dot <= 0) return false;
		const pathUserId = file.slice(0, dot);
		if (pathUserId !== userId) return false;
	}
	
	return true;
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return Response.json({ error: "Method not allowed" }, { status: 405 });
	}

	const user = await getAuthenticatedUser(request, getDatabase);
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as HandleUploadBody & {
		entityType?: FileEntityType;
	};

	const entityType = (body as any).entityType as FileEntityType | undefined;
	if (!entityType || !["receipt", "minute", "avatar"].includes(entityType)) {
		return Response.json({ error: "Valid entityType is required" }, { status: 400 });
	}

	const permissions = PERMISSION_MAP[entityType];
	const hasPermission = user.permissions.some((p) => 
		permissions.includes(p) || p === "*"
	);
	if (!hasPermission) {
		return Response.json({ error: "Forbidden" }, { status: 403 });
	}

	const config = FILE_TYPE_CONFIGS[entityType];

	try {
		const jsonResponse = await handleUpload({
			body,
			request,
			onBeforeGenerateToken: async (pathname: string) => {
				if (!isValidPathname(pathname, entityType, user.userId)) {
					throw new Error("Invalid upload path");
				}
				return {
					allowedContentTypes: [...config.mimeTypes],
				};
			},
		});

		return Response.json(jsonResponse);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Upload failed";
		return Response.json({ error: message }, { status: 400 });
	}
}
