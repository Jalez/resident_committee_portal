import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server.server";
import { requireAnyPermission } from "~/lib/auth.server";
import { isValidAvatarPathname } from "~/lib/avatars/utils";

const AVATAR_ALLOWED_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return Response.json({ error: "Method not allowed" }, { status: 405 });
	}

	await requireAnyPermission(
		request,
		["avatars:write", "admin:storage:write"],
		getDatabase,
	);

	const body = (await request.json()) as HandleUploadBody;

	try {
		const jsonResponse = await handleUpload({
			body,
			request,
			onBeforeGenerateToken: async (pathname: string) => {
				if (!isValidAvatarPathname(pathname)) {
					throw new Error("Invalid avatar upload path");
				}
				return {
					allowedContentTypes: [...AVATAR_ALLOWED_MIME_TYPES],
					allowOverwrite: true,
				};
			},
		});

		return Response.json(jsonResponse);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Upload failed";
		return Response.json({ error: message }, { status: 400 });
	}
}
