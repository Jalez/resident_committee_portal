import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server.server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { getEntityPrefix } from "~/lib/file-upload.server";
import type { FileEntityType } from "~/lib/file-upload-types";
import { FILE_TYPE_CONFIGS } from "~/lib/file-upload-types";

const VALID_ENTITY_TYPES: FileEntityType[] = ["receipt", "minute", "avatar"];

const PERMISSION_MAP: Record<FileEntityType, string[]> = {
	receipt: ["treasury:receipts:write", "treasury:receipts:update"],
	minute: ["minutes:write", "minutes:update"],
	avatar: ["profile:write:own"],
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

function parseEntityType(clientPayload: string | null): FileEntityType | null {
	if (!clientPayload) return null;
	try {
		const parsed = JSON.parse(clientPayload);
		const type = parsed?.entityType as string | undefined;
		if (type && VALID_ENTITY_TYPES.includes(type as FileEntityType)) {
			return type as FileEntityType;
		}
	} catch {
		// invalid JSON
	}
	return null;
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return Response.json({ error: "Method not allowed" }, { status: 405 });
	}

	const user = await getAuthenticatedUser(request, getDatabase);
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body = (await request.json()) as HandleUploadBody;

	try {
		const jsonResponse = await handleUpload({
			body,
			request,
			onBeforeGenerateToken: async (pathname: string, clientPayload: string | null) => {
				const entityType = parseEntityType(clientPayload);
				if (!entityType) {
					throw new Error("Valid entityType is required in clientPayload");
				}

				const permissions = PERMISSION_MAP[entityType];
				const hasPermission = user.permissions.some((p) =>
					permissions.includes(p) || p === "*"
				);
				if (!hasPermission) {
					throw new Error("Forbidden");
				}

				if (!isValidPathname(pathname, entityType, user.userId)) {
					throw new Error("Invalid upload path");
				}

				const config = FILE_TYPE_CONFIGS[entityType];
				return {
					allowedContentTypes: [...config.mimeTypes],
				};
			},
		});

		return Response.json(jsonResponse);
	} catch (error) {
		console.error("[upload-token] Error:", error);
		const message = error instanceof Error ? error.message : "Upload failed";
		return Response.json({ error: message }, { status: 400 });
	}
}
