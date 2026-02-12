import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server";
import { getAuthenticatedUser } from "~/lib/auth.server";
import { getAvatarsPrefix } from "~/lib/avatars/utils";

/**
 * Check if URL is from our blob store and is an avatar path (for security).
 * We accept either the full blob URL or a path that contains avatars/
 */
function isAllowedAvatarUrl(url: string | null): boolean {
	if (url === null || url === "") return true; // allow clearing
	if (typeof url !== "string") return false;
	// Allow blob.vercel-storage.com and path containing avatars/
	const prefix = getAvatarsPrefix();
	if (url.includes("blob.vercel-storage.com") && url.includes(prefix)) {
		return true;
	}
	// Reject relative or other origins for avatar
	try {
		const u = new URL(url);
		if (u.protocol !== "https:") return false;
		if (!u.hostname.endsWith("blob.vercel-storage.com")) return false;
		return u.pathname.startsWith(`/${prefix}`);
	} catch {
		return false;
	}
}

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

	let body: { url?: string | null };
	try {
		body = (await request.json()) as { url?: string | null };
	} catch {
		return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const url = body.url === undefined ? undefined : body.url;
	if (url !== undefined && !isAllowedAvatarUrl(url)) {
		return new Response(JSON.stringify({ error: "Invalid avatar URL" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const db = getDatabase();
	await db.updateUser(user.userId, {
		picture: url === null || url === "" ? null : url,
	});

	return Response.json({ success: true });
}
