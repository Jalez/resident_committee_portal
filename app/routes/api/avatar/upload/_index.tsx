import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { isValidAvatarPathname } from "~/lib/avatars/utils";

const AVATAR_ALLOWED_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return new Response(JSON.stringify({ error: "Method not allowed" }), {
			status: 405,
			headers: { "Content-Type": "application/json" },
		});
	}

	const user = await getAuthenticatedUser(request, getDatabase);
	if (!user) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	const body = (await request.json()) as HandleUploadBody;

	try {
		const jsonResponse = await handleUpload({
			body,
			request,
			onBeforeGenerateToken: async (pathname: string) => {
				if (!isValidAvatarPathname(pathname, user.userId)) {
					throw new Error("Invalid avatar upload path");
				}
				return {
					allowedContentTypes: [...AVATAR_ALLOWED_MIME_TYPES],
				};
			},
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
