import type { LoaderFunctionArgs } from "react-router";
import sharp from "sharp";
import { getDatabase } from "~/db/server.server";
import { requireAnyPermission } from "~/lib/auth.server";
import { getReceiptStorage } from "~/lib/receipts/server";
import { getReceiptsPrefix } from "~/lib/receipts/utils";

const IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const DEFAULT_WIDTH = 400;
const MAX_AGE = 60 * 60 * 24; // 1 day

function isSafePathname(pathname: string): boolean {
	const prefix = getReceiptsPrefix();
	if (!pathname || !pathname.startsWith(prefix)) return false;
	if (pathname.includes("..")) return false;
	return true;
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireAnyPermission(
		request,
		[
			"treasury:read",
			"treasury:reimbursements:write",
			"treasury:transactions:write",
			"inventory:write",
		],
		getDatabase,
	);

	const url = new URL(request.url);
	const pathname = url.searchParams.get("pathname");
	const width = Math.min(
		800,
		Math.max(
			100,
			parseInt(url.searchParams.get("w") || String(DEFAULT_WIDTH), 10) ||
			DEFAULT_WIDTH,
		),
	);

	if (!pathname || !isSafePathname(pathname)) {
		return new Response("Invalid pathname", { status: 400 });
	}

	try {
		const storage = getReceiptStorage();
		const meta = await storage.getFileMetadata(pathname);
		if (!meta || !IMAGE_CONTENT_TYPES.has(meta.contentType)) {
			return new Response("Not an image", { status: 404 });
		}

		const imageResponse = await fetch(meta.url);
		if (!imageResponse.ok) {
			return new Response("Failed to fetch image", { status: 502 });
		}

		const arrayBuffer = await imageResponse.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		const resized = await sharp(buffer)
			.resize(width, undefined, { withoutEnlargement: true })
			.jpeg({ quality: 80 })
			.toBuffer();

		return new Response(resized as unknown as BodyInit, {
			status: 200,
			headers: {
				"Content-Type": "image/jpeg",
				"Cache-Control": `public, max-age=${MAX_AGE}`,
			},
		});
	} catch (error) {
		console.error("[api.receipts.thumbnail]", error);
		return new Response("Not found", { status: 404 });
	}
}
