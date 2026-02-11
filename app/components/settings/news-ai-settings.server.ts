import type { DatabaseAdapter } from "~/db";
import { SETTINGS_KEYS } from "~/lib/openrouter.server";

export async function handleNewsAiSettingsAction(
	db: DatabaseAdapter,
	formData: FormData,
) {
	const model = formData.get("newsModel") as string;
	if (model) {
		await db.setSetting(
			SETTINGS_KEYS.NEWS_AI_MODEL,
			model,
			"AI model for news translation",
		);
	}
	return { success: true, message: "News settings saved" };
}
