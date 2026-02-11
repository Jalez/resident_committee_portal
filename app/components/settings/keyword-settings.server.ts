import type { DatabaseAdapter } from "~/db";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";

export async function handleKeywordSettingsAction(
	db: DatabaseAdapter,
	formData: FormData,
) {
	const intent = formData.get("intent") as string;

	if (intent === "save-approval-keywords") {
		const keywords = formData.get("keywords") as string;
		await db.setSetting(
			SETTINGS_KEYS.APPROVAL_KEYWORDS,
			keywords,
			"Custom approval keywords (comma separated)",
		);
		return { success: true, message: "Approval keywords saved" };
	}

	if (intent === "save-rejection-keywords") {
		const keywords = formData.get("keywords") as string;
		await db.setSetting(
			SETTINGS_KEYS.REJECTION_KEYWORDS,
			keywords,
			"Custom rejection keywords (comma separated)",
		);
		return { success: true, message: "Rejection keywords saved" };
	}

	return { error: "Unknown action" };
}
