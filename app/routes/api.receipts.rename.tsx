import { copy, del, head } from "@vercel/blob";
import type { ActionFunctionArgs } from "react-router";
import { getDatabase } from "~/db";
import { requireAnyPermission } from "~/lib/auth.server";
import { clearCache } from "~/lib/cache.server";
import { RECEIPT_ALLOWED_TYPES } from "~/lib/constants";
import { getReceiptsPrefix } from "~/lib/receipts/utils";

function isSafePathname(pathname: string): boolean {
	const prefix = getReceiptsPrefix();
	if (!pathname || !pathname.startsWith(prefix)) return false;
	if (pathname.includes("..")) return false;
	const parts = pathname.split("/").filter(Boolean);
	// receipts/{year}/{filename}
	if (parts.length < 3) return false;
	if (!/^\d{4}$/.test(parts[1])) return false;
	return true;
}

function sanitizeFilenamePart(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9._-]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "")
		.substring(0, 200) || "kuitti";
}

/**
 * Build a safe new filename: sanitize base, ensure allowed extension.
 * If newName has an allowed extension, use it; otherwise preserve extension from pathname.
 */
function buildSafeNewFilename(newName: string, pathname: string): string {
	const trimmed = (newName ?? "").trim();
	const pathParts = pathname.split("/").filter(Boolean);
	const oldFilename = pathParts[pathParts.length - 1] ?? "";
	const oldExt = oldFilename.includes(".")
		? `.${oldFilename.split(".").pop()?.toLowerCase() ?? ""}`
		: ".pdf";

	const lower = trimmed.toLowerCase();
	const hasAllowedExt = RECEIPT_ALLOWED_TYPES.some((ext) => lower.endsWith(ext));
	if (hasAllowedExt) {
		const lastDot = trimmed.lastIndexOf(".");
		const base = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
		const ext = trimmed.slice(lastDot).toLowerCase();
		return `${sanitizeFilenamePart(base)}${ext}`;
	}
	return `${sanitizeFilenamePart(trimmed || "kuitti")}${oldExt}`;
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST" && request.method !== "PATCH") {
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

	let body: { pathname?: string; newName?: string };
	try {
		body = (await request.json()) as { pathname?: string; newName?: string };
	} catch {
		return new Response(
			JSON.stringify({ error: "Invalid JSON body" }),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

	const pathname = body.pathname;
	const newName = body.newName;

	if (!pathname || typeof pathname !== "string" || !isSafePathname(pathname)) {
		return new Response(JSON.stringify({ error: "Invalid pathname" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (!newName || typeof newName !== "string") {
		return new Response(JSON.stringify({ error: "newName is required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const prefix = getReceiptsPrefix();
	const parts = pathname.slice(prefix.length).split("/").filter(Boolean);
	const year = parts[0] ?? String(new Date().getFullYear());
	const safeFilename = buildSafeNewFilename(newName, pathname);
	const toPathname = `${prefix}${year}/${safeFilename}`;

	if (toPathname === pathname) {
		return Response.json({ pathname, url: "" });
	}

	try {
		await head(pathname);
	} catch {
		return new Response(JSON.stringify({ error: "Receipt not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const result = await copy(pathname, toPathname, { access: "public" });
		await del(pathname);
		clearCache("RECEIPTS_BY_YEAR");
		return Response.json({
			pathname: result.pathname,
			url: result.url,
		});
	} catch (error) {
		console.error("[api.receipts.rename]", error);
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "Rename failed",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}
