import { type ActionFunctionArgs, data } from "react-router";
import { getDatabase } from "~/db/server";
import { requirePermission } from "~/lib/auth.server";
import { setThemePrimaryColor } from "~/lib/settings.server";

export async function action({ request }: ActionFunctionArgs) {
	await requirePermission(request, "settings:general", getDatabase);

	const formData = await request.formData();
	const primary = formData.get("primary") as string;

	if (!primary || !/^#[0-9a-fA-F]{6}$/.test(primary)) {
		return data(
			{ success: false, error: "Invalid primary color" },
			{ status: 400 },
		);
	}

	await setThemePrimaryColor(primary);

	return data({ success: true, primary });
}
