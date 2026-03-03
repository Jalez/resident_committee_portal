import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db/server.server";
import { requireAnyPermission } from "~/lib/auth.server";
import { isCustomAvatarUrl } from "~/lib/avatars/utils";

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return Response.json({ error: "Method not allowed" }, { status: 405 });
	}

	await requireAnyPermission(
		request,
		["avatars:write", "admin:storage:write"],
		getDatabase,
	);

	let body: { userId?: string; url?: string | null };
	try {
		body = (await request.json()) as { userId?: string; url?: string | null };
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const { userId, url } = body;
	if (!userId || typeof userId !== "string") {
		return Response.json({ error: "userId is required" }, { status: 400 });
	}

	if (url !== null && url !== undefined && !isCustomAvatarUrl(url)) {
		return Response.json({ error: "Invalid avatar URL" }, { status: 400 });
	}

	const db = getDatabase();
	const user = await db.findUserById(userId);
	if (!user) {
		return Response.json({ error: "User not found" }, { status: 404 });
	}

	await db.updateUser(userId, { picture: url || null });

	return Response.json({ success: true });
}
