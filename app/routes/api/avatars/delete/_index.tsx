import { del } from "@vercel/blob";
import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { isValidAvatarPathname } from "~/lib/avatars/utils";

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST" && request.method !== "DELETE") {
		return new Response(JSON.stringify({ error: "Method not allowed" }), {
			status: 405,
			headers: { "Content-Type": "application/json" },
		});
	}

	await requirePermission(request, "avatars:delete", getDatabase);

	let body: { pathname?: string };
	try {
		body = (await request.json()) as { pathname?: string };
	} catch {
		return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const pathname = body.pathname;
	if (
		!pathname ||
		typeof pathname !== "string" ||
		!isValidAvatarPathname(pathname)
	) {
		return new Response(JSON.stringify({ error: "Invalid pathname" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		await del(pathname);
	} catch (error) {
		console.error("[api.avatars.delete]", error);
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "Delete failed",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	// Clear any user's picture that pointed to this blob (avoid broken image)
	const db = getDatabase();
	const users = await db.getAllUsers();
	for (const u of users) {
		if (
			u.picture &&
			(u.picture.includes(pathname) || u.picture.endsWith(pathname))
		) {
			await db.updateUser(u.id, { picture: null });
		}
	}

	return Response.json({ success: true });
}
