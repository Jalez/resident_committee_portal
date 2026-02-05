import { del } from "@vercel/blob";
import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db";
import { requireAnyPermission } from "~/lib/auth.server";
import { clearCache } from "~/lib/cache.server";
import { getReceiptsPrefix } from "~/lib/receipts/utils";

function isSafePathname(pathname: string): boolean {
	const prefix = getReceiptsPrefix();
	if (!pathname || !pathname.startsWith(prefix)) return false;
	if (pathname.includes("..")) return false;
	return true;
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST" && request.method !== "DELETE") {
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
	if (!pathname || typeof pathname !== "string" || !isSafePathname(pathname)) {
		return new Response(JSON.stringify({ error: "Invalid pathname" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		await del(pathname);
		clearCache("RECEIPTS_BY_YEAR");
		return Response.json({ success: true });
	} catch (error) {
		console.error("[api.receipts.delete]", error);
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
}
