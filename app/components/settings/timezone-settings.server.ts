import { setDefaultTimezone } from "~/lib/settings.server";

export async function handleTimezoneSettingsAction(formData: FormData) {
	const timezone = formData.get("timezone") as string;

	if (!timezone || timezone === "__custom__") {
		return { success: false, error: "Missing timezone" };
	}

	await setDefaultTimezone(timezone);

	return { success: true };
}
