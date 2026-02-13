import { getDatabase } from "~/db/server.server";
import { requirePermission } from "~/lib/auth.server";
import type { Route } from "./+types/_index";

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(
		request,
		"treasury:reimbursements:write",
		getDatabase,
	);

	const url = new URL(request.url);
	const limitParam = url.searchParams.get("limit");
	const limit = limitParam ? Number.parseInt(limitParam, 10) : 20;

	const db = getDatabase();
	const allMinutes = await db.getMinutes();
	const recentMinutes = allMinutes
		.filter((m) => m.status !== "draft")
		.map((m) => ({
			id: m.id,
			name: m.title || "Untitled",
			url: m.fileUrl,
			year: m.year?.toString() || new Date().getFullYear().toString(),
		}))
		.slice(0, Number.isNaN(limit) ? 20 : limit);

	return { minutes: recentMinutes };
}
