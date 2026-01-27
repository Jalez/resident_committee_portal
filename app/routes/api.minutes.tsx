import { getDatabase } from "~/db";
import { requirePermission } from "~/lib/auth.server";
import { getMinutesByYear } from "~/lib/google.server";
import type { Route } from "./+types/api.minutes";

export async function loader({ request }: Route.LoaderArgs) {
	await requirePermission(request, "reimbursements:write", getDatabase);

	const url = new URL(request.url);
	const limitParam = url.searchParams.get("limit");
	const limit = limitParam ? Number.parseInt(limitParam, 10) : 20;

	const minutesByYear = await getMinutesByYear();
	const recentMinutes = minutesByYear
		.flatMap((year) =>
			year.files.map((file) => ({
				id: file.id,
				name: file.name,
				url: file.url,
				year: year.year,
			})),
		)
		.slice(0, Number.isNaN(limit) ? 20 : limit);

	return { minutes: recentMinutes };
}
